// Server-side CLI health check for the Reserve Editorial Engine's AI
// provider. Run with `npm run ai:health` (or `tsx scripts/test-ai-provider.ts`
// directly, from the project root so `.env` is picked up).
//
// Exercises the exact same code path as the in-app "Test AI Connection"
// admin action and the /api/admin/ai-connection-test endpoint -- useful for
// verifying TABITOKEN_API_KEY / TABITOKEN_BASE_URL / TABITOKEN_MODEL from a
// terminal or CI job before enabling any editorial automation.
import { testAIConnection } from '../src/services/ai';

async function main() {
  console.log('[AI Health Check] Testing Tabitoken gateway connection...');
  const result = await testAIConnection();
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    console.error('[AI Health Check] FAILED');
    process.exitCode = 1;
    return;
  }
  console.log('[AI Health Check] OK');
}

main().catch((error) => {
  console.error('[AI Health Check] Unexpected error:', error);
  process.exitCode = 1;
});
