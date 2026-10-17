// Role-specific staff landing pages. This is navigation only, never a substitute
// for server-side permission and active-account checks on destination routes.
export function staffHomePath(role: string | null | undefined): string {
  switch (role) {
    case "owner":
    case "manager":
      return "/dashboard";
    case "cashier":
      return "/pos";
    case "baker":
      return "/production";
    case "storekeeper":
      return "/inventory";
    case "viewer":
      return "/view-only";
    default:
      return "/access-denied?reason=role";
  }
}
