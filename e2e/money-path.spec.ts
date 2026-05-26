import { test, expect } from '@playwright/test';

// The core money path, end to end through a real browser: register → sign in →
// land with the 1,000-coin signup balance → place a Dice bet. The bet exercises
// the server-authoritative pipeline (deduct in a locked tx → crypto RNG resolve →
// settle + game log → balance:update), and we assert the balance actually moved
// and a result rendered. This is the one full-stack smoke that the unit/integration
// suites (shared RTP, backend supertest) can't cover from inside the browser.
test('register → sign in → dice bet runs the deduct→resolve→settle money path', async ({ page }) => {
  const stamp = Date.now().toString(36);
  const username = `e2e${stamp}`.slice(0, 20);
  const email = `${username}@example.com`;
  const password = 'e2epassword123';

  // Register. Email verification is disabled, so the account is usable immediately.
  await page.goto('/register');
  await page.fill('#email', email);
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
  await expect(page.getByRole('heading', { name: "You're in." })).toBeVisible({ timeout: 15_000 });

  // Sign in.
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');

  // Lands logged in with the signup bonus.
  const balance = page.getByLabel('Coin balance');
  await expect(balance).toContainText('1,000', { timeout: 15_000 });
  const before = (await balance.innerText()).trim();

  // Place a Dice bet (default stake 10) and confirm the money path settled: a
  // win/loss result renders and the balance moves off the starting 1,000.
  await page.goto('/games/dice');
  const roll = page.getByRole('button', { name: 'Roll dice' });
  await expect(roll).toBeVisible();
  await roll.click();

  await expect(page.locator('.dice-result-label')).toBeVisible({ timeout: 10_000 });
  await expect(balance).not.toHaveText(before, { timeout: 10_000 });
});
