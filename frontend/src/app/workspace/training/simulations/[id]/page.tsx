"use client";

import { useParams } from "next/navigation";

import { SimulationWorkspace } from "../../_components/simulation-workspace";

export default function TrainingSimulationDetailPage() {
  const params = useParams<{ id: string }>();

  return <SimulationWorkspace simulationId={params.id} />;
}
