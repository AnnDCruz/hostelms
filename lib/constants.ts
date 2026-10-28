import type { Role } from "@prisma/client";

// Single-location for now. Multi-location comes later via the Location model.
export const LOCATION_ID = "location-1";

export const ROLE_HOME: Record<Role, string> = {
  Student: "/student",
  Parent: "/parent",
  Warden: "/warden",
  ChiefWarden: "/chief-warden",
  Security: "/security",
  Facilities: "/facilities",
  Admin: "/admin",
};

export const ROLE_LABEL: Record<Role, string> = {
  Student: "Student",
  Parent: "Parent",
  Warden: "Warden",
  ChiefWarden: "Chief warden",
  Security: "Security",
  Facilities: "Facilities",
  Admin: "Admin",
};

export type NavItem = { label: string; href: string };

const page = (role: Role, label: string, slug: string): NavItem => ({ label, href: `${ROLE_HOME[role]}/${slug}` });
const home = (role: Role): NavItem => ({ label: "Dashboard", href: ROLE_HOME[role] });

const manager = (role: Role): NavItem[] => [
  home(role),
  page(role, "Rooms", "rooms"),
  page(role, "Students", "students"),
  page(role, "Gate passes", "gatepass"),
  page(role, "Maintenance", "maintenance"),
  page(role, "Laundry", "laundry"),
  page(role, "Shifts", "shifts"),
  page(role, "Notices", "notices"),
  page(role, "Feedback", "feedback"),
];

export const NAV: Record<Role, NavItem[]> = {
  Student: [home("Student"), page("Student", "Profile", "profile"), page("Student", "Gate passes", "gatepass"), page("Student", "Maintenance", "maintenance"), page("Student", "Laundry", "laundry"), page("Student", "Notices", "notices"), page("Student", "Feedback", "feedback")],
  Parent: [home("Parent"), page("Parent", "Gate passes", "gatepass"), page("Parent", "Feedback", "feedback")],
  Warden: manager("Warden"),
  ChiefWarden: manager("ChiefWarden"),
  Security: [home("Security"), page("Security", "Shifts", "shifts"), page("Security", "Maintenance", "maintenance")],
  Facilities: [home("Facilities"), page("Facilities", "Maintenance", "maintenance")],
  Admin: [home("Admin")],
};
