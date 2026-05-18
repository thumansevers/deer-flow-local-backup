"use client";

import { useParams } from "next/navigation";

import { SimulationPractice } from "../../_components/simulation-workspace";

export default function TrainingSimulationDetailPage() {
  const params = useParams<{ id: string }>();

  return <SimulationPractice simulationId={params.id} />;
}
