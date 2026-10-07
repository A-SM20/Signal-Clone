import { expect, type Page, test } from "@playwright/test";

// Seeded demo users (see the README). Every account starts with the default PIN 123456.
const PHONES: Record<string, string> = { "Alice Chen": "555 010 0001", "Bob Martinez": "555 010 0002" };

async function signIn(page: Page, name: string) {
  await page.goto("/onboarding/");
  await page.getByRole("textbox", { name: "Phone number" }).fill(PHONES[name]);
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("PIN", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Chats" })).toBeVisible();
}

async function openChat(page: Page, title: string) {
  await page.getByRole("button", { name: new RegExp(`^${title}`) }).first().click();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
}

test("alice and bob chat in real time", async ({ browser }) => {
  const alice = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const bob = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await signIn(alice, "Alice Chen");
  await signIn(bob, "Bob Martinez");

  await openChat(alice, "Bob Martinez");
  const text = `Live from Playwright ${Date.now()}`;
  const box = alice.getByRole("textbox", { name: "Message" });
  await box.fill(text);
  await box.press("Enter");

  // Bob sees it in his chat list without reloading...
  await expect(bob.getByText(text)).toBeVisible();
  const aliceBubble = alice.locator("[data-message-id]").filter({ hasText: text });
  await expect(aliceBubble.locator('[data-status="delivered"], [data-status="read"]')).toBeVisible();

  // ...and once he opens the chat, Alice's ticks turn to "read".
  await openChat(bob, "Alice Chen");
  await expect(aliceBubble.locator('[data-status="read"]')).toBeVisible();
});
