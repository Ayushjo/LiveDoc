// Phase 1 — dashboard shell layout with sidebar nav.
// TODO: implement with auth guard when instructed.
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="flex min-h-screen">{children}</div>;
}
