"use client";

import { useParams } from "next/navigation";

import { RoleEditor } from "../../_components/role-editor";

export default function EditTrainingRolePage() {
  const params = useParams<{ id: string }>();

  return <RoleEditor mode="edit" roleId={params.id} />;
}
