import fs from "node:fs";
import assert from "node:assert/strict";

const admin = fs.readFileSync(new URL("../admin/admin.js", import.meta.url), "utf8");
const adminCss = fs.readFileSync(new URL("../admin/admin.css", import.meta.url), "utf8");
const adminHtml = fs.readFileSync(new URL("../admin/index.html", import.meta.url), "utf8");
// Formatter-proof source checks: admin.js may be reformatted (e.g. Prettier line
// wrapping, trailing commas) without behavior changes, so compare flattened text.
const flattenSource = text => text.replace(/\s+/g, "").replace(/,([)\]}])/g, "$1");
const adminFlat = flattenSource(admin);
const adminHas = snippet => adminFlat.includes(flattenSource(snippet));
const has = (text, snippet) => flattenSource(text).includes(flattenSource(snippet));

let tests = 0;
let assertions = 0;
const ok = (value, message) => { assertions += 1; assert.ok(value, message); };
const equal = (actual, expected, message) => { assertions += 1; assert.equal(actual, expected, message); };
const test = async (name, fn) => {
  await fn();
  tests += 1;
  console.log(`  ok  ${name}`);
};

await test("conversation context uses the standard Messages topbar", () => {
  ok(adminHtml.includes('id="messagesBackBtn" class="secondary messages-topbar-back"'));
  ok(adminHtml.includes('id="messagesTitle" class="topbar-title"'));
  ok(adminHtml.includes('id="msgThreadDeleteBtn" class="secondary topbar-icon-action messages-thread-delete"'));
  const header = admin.match(/function setMessagesTopbar\([\s\S]*?\n\}(?=\n)/)?.[0] || "";
  ok(has(header, 'messagesTitle.textContent = inThread'));
  ok(has(header, 'messagesCount.textContent = parts.join(" · ")'));
  ok(has(header, "msgThreadDeleteBtn.dataset.delThread"));
  equal(admin.match(/<div class="msg-convo-head">/g)?.length || 0, 0);
});

await test("refreshes update only the open message stream", () => {
  const refresh = admin.match(/async function refreshMessages\([\s\S]*?\n\}(?=\n)/)?.[0] || "";
  ok(has(refresh, "refreshOpenMessageThread()"));
  equal(has(refresh, "document.activeElement"), false);
  const stream = admin.match(/function renderOpenMessageStream\([\s\S]*?\n\}(?=\n)/)?.[0] || "";
  ok(has(stream, "const previousTop = convo.scrollTop"));
  ok(has(stream, "forceBottom ? convo.scrollHeight : previousTop"));
  ok(has(stream, "messageThreadPinned = forceBottom || isMessageThreadNearBottom(convo)"));
  ok(adminHas('messagesPanel.addEventListener("scroll"'));
  ok(adminHas('if (latest) latest.hidden = true'));
});

await test("messages show useful send state and timestamps", () => {
  const bubbles = admin.match(/function buildMessageBubbles\([\s\S]*?\n\}(?=\n)/)?.[0] || "";
  ok(has(bubbles, 'm.state === "pending"'));
  ok(has(bubbles, 'm.state === "failed"'));
  ok(has(bubbles, 'formatConversationMessageTime(m.createdAt)'));
  ok(has(bubbles, '<span class="msg-time">'));
  const send = admin.match(/async function handleMessageReply\([\s\S]*?\n\}(?=\n)/)?.[0] || "";
  ok(has(send, 'id: optimisticId'));
  ok(has(send, 'state: "pending"'));
  ok(has(send, 'pending.state = "failed"'));
  ok(has(send, "refreshOpenMessageThread()"));
});

await test("composer behaves like a chat composer", () => {
  const composer = admin.match(/function syncMessageComposer\([\s\S]*?\n\}(?=\n)/)?.[0] || "";
  ok(has(composer, 'input.style.height = "auto"'));
  ok(has(composer, "Math.min(input.scrollHeight, 120)"));
  ok(has(composer, "btn.disabled = messageSending"));
  ok(adminHas('e.target?.id !== "msgReplyInput" || e.key !== "Enter" || e.shiftKey'));
  ok(adminHas('window.matchMedia("(hover: hover) and (pointer: fine)")'));
  ok(adminHas('data-msg-latest hidden>New messages'));
});

await test("Messages v2 styling remains isolated to the inbox", () => {
  ok(adminCss.includes("MESSAGES V2 — DEER ISLAND CHAT FLOW"));
  ok(adminCss.includes("#messagesView.active{"));
  ok(adminCss.includes("#messagesPanel{"));
  ok(adminCss.includes("overflow-y:auto"));
  ok(adminCss.includes(".msg-convo-shell .msg-convo{"));
  ok(adminCss.includes("overscroll-behavior:contain"));
  ok(adminCss.includes(".msg-jump-latest{"));
  ok(adminCss.includes(".msg-send-btn:disabled{"));
});

console.log(`\nMessages self-test: ${tests} tests, ${assertions} assertions passed.`);
