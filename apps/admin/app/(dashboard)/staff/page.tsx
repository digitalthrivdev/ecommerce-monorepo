import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { AddStaffDialog, RemoveStaffButton, SetStaffPasswordDialog } from "@/components/staff/staff-controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { getPublicSettings, requireAdmin } from "@/lib/dal";
import { formatDate } from "@/lib/format";
import type { StaffMember } from "@/lib/types";

export const metadata: Metadata = { title: "Staff" };

export default async function StaffPage() {
  await requireAdmin();
  const [staff, settings] = await Promise.all([apiFetch<{ items: StaffMember[] }>("/staff"), getPublicSettings()]);

  return (
    <>
      <PageHeader title="Staff" description="People who accept and pack orders and keep stock up to date" actions={<AddStaffDialog />} />

      <div className="flex max-w-4xl flex-col gap-4 p-4 md:p-6">
        <Card>
          <CardContent>
            {staff.items.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No staff yet. Add someone to accept and pack orders.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.items.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="flex items-center gap-2 font-medium">
                          {member.name ?? "—"}
                          {!member.email && <Badge variant="outline">Cannot sign in</Badge>}
                          {member.isTestAccount && <Badge variant="secondary">Demo</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {member.email ?? "No email: add them again with an email"} · {member.phone}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(member.createdAt, settings.timezone)}</TableCell>
                      <TableCell className="text-right">
                        {member.email && <SetStaffPasswordDialog member={{ ...member, email: member.email }} />}
                        <RemoveStaffButton member={member} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <p className="text-sm text-muted-foreground">
          Staff sign in with their email and password. They see orders, stock and ratings, but not settings, customers or reports.
        </p>
      </div>
    </>
  );
}
