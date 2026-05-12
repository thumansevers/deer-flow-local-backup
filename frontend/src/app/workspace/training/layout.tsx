import { TrainingShell } from "./training-shell";

export default function TrainingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TrainingShell>{children}</TrainingShell>;
}
