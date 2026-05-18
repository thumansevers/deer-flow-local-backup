"use client";

import { useParams } from "next/navigation";

import { ScenarioEditor } from "../../_components/scenario-editor";

export default function EditTrainingScenarioPage() {
  const params = useParams<{ id: string }>();

  return <ScenarioEditor mode="edit" scenarioId={params.id} />;
}
