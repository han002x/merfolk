import { test, expect } from '@playwright/test';

test('docs page renders the ontology and in-page links stay on it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'More actions', exact: true }).click();
  const [docs] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('menuitem', { name: 'Docs', exact: true }).click(),
  ]);
  await expect(docs).toHaveURL(/#\/docs$/);
  await expect(docs.getByRole('heading', { name: 'merfolk ontology', level: 1 })).toBeVisible();
  await expect(docs.getByRole('heading', { name: 'DiagramNode', level: 2 })).toBeVisible();

  await docs.getByRole('link', { name: 'Shapes', exact: true }).first().click();
  await expect(docs).toHaveURL(/#\/docs$/);
  await expect(docs.locator('#shapes')).toBeInViewport();

  await docs.getByRole('link', { name: '← Canvas' }).click();
  await expect(docs).toHaveURL(/#\/$/);
});
