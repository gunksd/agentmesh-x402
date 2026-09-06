import { Footer } from "@/components/Footer";
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
      <Footer />
    </main>
  );
}
