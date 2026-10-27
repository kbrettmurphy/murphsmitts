import assert from "node:assert/strict";
import fs from "node:fs";

const admin = fs.readFileSync(new URL("../admin/admin.js", import.meta.url), "utf8");
const api = fs.readFileSync(new URL("../functions/api/orders.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../admin/admin.css", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../admin/index.html", import.meta.url), "utf8");
// Formatter-proof source checks: admin.js may be reformatted (e.g. Prettier line
// wrapping, trailing commas) without behavior changes, so compare flattened text.
const flattenSource = text => text.replace(/\s+/g, "").replace(/,([)\]}])/g, "$1");
const adminFlat = flattenSource(admin);
const adminHas = snippet => adminFlat.includes(flattenSource(snippet));
const has = (text, snippet) => flattenSource(text).includes(flattenSource(snippet));
let tests = 0;
let assertions = 0;

function ok(value, message) {
  assertions += 1;
  assert.ok(value, message);
}

function equal(actual, expected, message) {
  assertions += 1;
  assert.equal(actual, expected, message);
}

async function test(name, fn) {
  tests += 1;
  await fn();
  console.log(`  ok  ${name}`);
}

function gallerySectionForGloveType(gloveType) {
  const normalized = String(gloveType || "").trim().toLowerCase();
  if (normalized === "catchers mitt") return "catchers-mitts";
  if (normalized === "first base mitt") return "first-base-mitts";
  return "fielding-gloves";
}

await test("Add Photo offers private and gallery destinations", () => {
  ok(adminHas('title: "Add Photo"'));
  ok(adminHas('{ label: "Customer / Order Photo", value: "order" }'));
  ok(adminHas('{ label: "Gallery Photo", value: "gallery" }'));
  ok(adminHas('destination === "order"'));
  ok(adminHas('destination !== "gallery"'));
});

await test("gallery section defaults from glove type", () => {
  equal(gallerySectionForGloveType("Fielders Glove"), "fielding-gloves");
  equal(gallerySectionForGloveType("Catchers Mitt"), "catchers-mitts");
  equal(gallerySectionForGloveType("First Base Mitt"), "first-base-mitts");
  equal(gallerySectionForGloveType(""), "fielding-gloves");
  ok(adminHas('document.getElementById("editGloveType")?.value || order.gloveType'));
  ok(adminHas("Object.entries(GALLERY_SECTION_LABELS)"));
  ok(adminHas('sectionSelect?.addEventListener("change"'));
});

await test("gallery uploads are linked to the current order", () => {
  const uploader = admin.slice(
    admin.indexOf("async function uploadOrderGalleryPhotos"),
    admin.indexOf("function mergeUpdatedOrder")
  );
  ok(has(uploader, 'action: "uploadGalleryPhoto"'));
  ok(has(uploader, 'action: "setGalleryPhotoOrder"'));
  ok(has(uploader, "orderNumber"));
  ok(uploader.indexOf('action: "uploadGalleryPhoto"') < uploader.indexOf('action: "setGalleryPhotoOrder"'));
  ok(has(uploader, "added to Gallery and linked to #"));
});

await test("upload menus use the anchored body-level portal", () => {
  ok(adminHas("getBenchChoiceRoot"));
  ok(adminHas("document.body.appendChild(benchChoiceRoot)"));
  ok(adminHas("anchor,"));
  ok(css.includes(".bench-choice-sheet.is-anchored"));
  ok(css.includes("position:fixed"));
  equal(adminHas('className = "order-gallery-bottom-sheet"'), false);
});

await test("gallery toolbar changes are vertical-only", () => {
  ok(/\.gallery-manager-filter\{[\s\S]*?height:34px;[\s\S]*?min-height:34px;/.test(css));
  ok(/\.gallery-manager-search\{[\s\S]*?height:34px;[\s\S]*?min-height:34px;/.test(css));
  ok(/@media \(min-width:900px\)\{[\s\S]*?\.gallery-manager-search\{[\s\S]*?font-size:\.82rem;/.test(css));
  ok(/\.gallery-manager-filter\{[\s\S]*?font-size:\.84rem!important;/.test(css));
  equal(css.includes("grid-template-columns:repeat(2,minmax(0,1fr))"), false);
  equal(css.includes("grid-column:2"), false);
  equal(html.includes('id="galleryRefreshBtn"'), false);
  equal(css.includes(".gallery-refresh-btn"), false);
});

await test("hidden gallery photos can be isolated and restored", () => {
  ok(html.includes('<option value="hidden">Hidden Photos</option>'));
  ok(adminHas('activeFilter === "hidden" ? photo.hidden : photo.section === activeFilter'));
  ok(adminHas('gallery-manager-item${photo.hidden ? " is-gallery-hidden" : ""}'));
  equal(adminHas('gallery-manager-item${photo.hidden ? " is-hidden" : ""}'), false);
  ok(adminHas('? "restoreGalleryPhoto"'));
});

await test("gallery manager uses pre-made _thumbs/ thumbnails", () => {
  ok(adminHas("function getGalleryManagerThumbnailUrl(photoUrl)"));
  // Thumbs are made at upload (_thumbs/<photo path>); Supabase on-the-fly image
  // transforms aren't on the plan and rate-limit, so they must not come back.
  ok(adminHas('url.pathname.replace(objectPrefix, `${objectPrefix}_thumbs/`)'));
  equal(adminHas("/storage/v1/render/image/"), false);
  ok(adminHas('getGalleryManagerThumbnailUrl(photo.url)'));
  ok(adminHas('data-gallery-thumb-src="${escapeAttr(getGalleryManagerThumbnailUrl(photo.url))}"'));
  ok(adminHas("function wireGalleryManagerThumbnails(root)"));
  ok(adminHas("const maxConcurrent = 4"));
  ok(adminHas("{ root: null, rootMargin"));
  ok(adminHas('rootMargin: "120px 0px"'));
  ok(adminHas("wireGalleryManagerThumbnails(list)"));
  ok(/\.gallery-manager-thumb img\{[\s\S]*?object-fit:contain;/.test(css));
});

await test("gallery storage listing retries transient rate limits", () => {
  const start = api.indexOf("async function listGallerySection");
  const end = api.indexOf("function galleryPhotoFromPath", start);
  const listing = api.slice(start, end);
  ok(listing.includes("resp.status !== 429"));
  ok(listing.includes("attempt < 4"));
  ok(listing.includes("250 * (2 ** attempt)"));
});

console.log(`\nOrder photo self-test: ${tests} tests, ${assertions} assertions passed.`);
