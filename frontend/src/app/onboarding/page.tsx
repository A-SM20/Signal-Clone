import { ApiGate } from "@/components/app/ApiGate";
import { OnboardingFlow } from "@/features/onboarding/OnboardingFlow";

export default function OnboardingPage() {
  return (
    <ApiGate>
      <OnboardingFlow />
    </ApiGate>
  );
}
