import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { gatepassWhere } from "@/lib/gatepass";
import { maintenanceWhere } from "@/lib/maintenance";
import { shiftSummary } from "@/lib/shifts";
import { ROLE_HOME, ROLE_LABEL } from "@/lib/constants";
import type { SessionUser } from "@/lib/types";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { LocalTime } from "@/components/shared/local-time";

const STATUS_LABEL: Record<string, string> = {
  Request: "Waiting for parent",
  ParentApproval: "Waiting for warden",
  WardenApproval: "Approved",
  Exit: "Out of hostel",
  Returned: "Returned",
  ReturnedLate: "Returned late",
  Rejected: "Rejected",
};

export async function RoleHome() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;

  const where = gatepassWhere(user);
  const counts = where
    ? await prisma.gatepass.groupBy({
        by: ["status"],
        where: { ...where, deletedAt: null },
        _count: { _all: true },
      })
    : [];

  const mWhere = maintenanceWhere(user);
  const mCounts = mWhere
    ? await prisma.maintenanceRequest.groupBy({
        by: ["status"],
        where: { ...mWhere, deletedAt: null },
        _count: { _all: true },
      })
    : [];

  const shifts = await shiftSummary(user);
  const shiftsHref = `${ROLE_HOME[user.role]}/shifts`;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-muted">
            Signed in as {user.email} ({ROLE_LABEL[user.role]}).
          </p>
        </CardBody>
      </Card>

      {shifts && (
        <Card>
          <CardHeader>
            <CardTitle>{shifts.kind === "guard" ? "Your shift" : "Security shifts"}</CardTitle>
            <Link href={shiftsHref} className="text-sm text-accent hover:underline">Open shifts</Link>
          </CardHeader>
          <CardBody>
            {shifts.kind === "guard" ? (
              shifts.onShift ? (
                <p className="text-sm">
                  <strong>On shift</strong> in Block {shifts.onShift.blockName}, since <LocalTime iso={shifts.onShift.shiftIn} withDate />.
                </p>
              ) : (
                <p className="text-sm text-muted">
                  {shifts.blockCount === 0 ? "You are not assigned to a block yet." : "You are off shift. Open Shifts to start one."}
                </p>
              )
            ) : (
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-md border border-border bg-surface p-3">
                  <dt className="text-xs text-muted">Guards on shift</dt>
                  <dd className="text-2xl font-semibold">{shifts.onShift}</dd>
                </div>
                <div className="rounded-md border border-border bg-surface p-3">
                  <dt className="text-xs text-muted">Need an end time</dt>
                  <dd className={`text-2xl font-semibold ${shifts.needsReview > 0 ? "text-danger" : ""}`}>{shifts.needsReview}</dd>
                </div>
              </dl>
            )}
          </CardBody>
        </Card>
      )}

      {where && (
        <Card>
          <CardHeader>
            <CardTitle>Gate passes</CardTitle>
          </CardHeader>
          <CardBody>
            {counts.length === 0 ? (
              <p className="text-sm text-muted">No gate passes yet.</p>
            ) : (
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {counts.map((c) => (
                  <div key={c.status} className="rounded-md border border-border bg-surface p-3">
                    <dt className="text-xs text-muted">{STATUS_LABEL[c.status] ?? c.status}</dt>
                    <dd className="text-2xl font-semibold">{c._count._all}</dd>
                  </div>
                ))}
              </dl>
            )}
          </CardBody>
        </Card>
      )}

      {mWhere && (
        <Card>
          <CardHeader>
            <CardTitle>Maintenance requests</CardTitle>
          </CardHeader>
          <CardBody>
            {mCounts.length === 0 ? (
              <p className="text-sm text-muted">No maintenance requests yet.</p>
            ) : (
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {mCounts.map((c) => (
                  <div key={c.status} className="rounded-md border border-border bg-surface p-3">
                    <dt className="text-xs text-muted">{c.status === "InProgress" ? "In progress" : c.status}</dt>
                    <dd className="text-2xl font-semibold">{c._count._all}</dd>
                  </div>
                ))}
              </dl>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
