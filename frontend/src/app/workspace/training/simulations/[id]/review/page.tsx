"use client";

import { useParams } from "next/navigation";

import { SimulationReview } from "../../../_components/simulation-workspace";

export default function TrainingSimulationReviewPage() {
  const params = useParams<{ id: string }>();

  return <SimulationReview simulationId={params.id} />;
}
