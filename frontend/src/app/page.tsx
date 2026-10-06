import { ApiGate } from "@/components/app/ApiGate";

export default function Home() {
  return (
    <ApiGate>
      <main className="flex h-dvh items-center justify-center">Ready</main>
    </ApiGate>
  );
}
