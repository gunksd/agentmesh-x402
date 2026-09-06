import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { MeshConsole } from "@/components/MeshConsole";
import { StackNote } from "@/components/StackNote";

export default function Home() {
  return (
    <main className="flex-1">
      <Hero />
      <HowItWorks />
      <MeshConsole />
      <StackNote />
      <footer className="border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 py-8 text-[11px] text-[var(--subtle)] sm:flex-row sm:items-center sm:justify-between">
          <p>
            AgentMesh · x402 v2 payment mesh on BNB Smart Chain · Binance Agent OS
            Mini Hackathon
          </p>
          <p>
            Demo software. Testnet by default. Not financial advice, and not audited.
          </p>
        </div>
      </footer>
    </main>
  );
}
