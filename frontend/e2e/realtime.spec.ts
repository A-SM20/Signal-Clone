import { expect, type Page, test } from "@playwright/test";

async function signIn(page: Page, name: string) {
  await page.goto("/onboarding/");
  await page.getByRole("button", { name: new RegExp(name) }).click();
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
