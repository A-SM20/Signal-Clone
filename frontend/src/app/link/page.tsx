import { ApiGate } from "@/components/app/ApiGate";
import { LinkDeviceScreen } from "@/features/onboarding/LinkDeviceScreen";

export default function LinkPage() {
  return (
    <ApiGate>
      <LinkDeviceScreen />
    </ApiGate>
  );
}
