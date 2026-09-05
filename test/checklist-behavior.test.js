const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("checklist counts checks, emits each milestone once and downloads only the visible list", async () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
  const start = source.indexOf("function initCompatibilityChecklist()");
  const end = source.indexOf("function initRecommendation()", start);
  const handlers = {};
  const events = [];
  const boxes = Array.from({ length: 6 }, (_, index) => ({
    checked: false, closest: () => ({ textContent: `Verificação ${index + 1}` }),
  }));
  const fieldset = { querySelectorAll: () => boxes, addEventListener: (name, handler) => { handlers[name] = handler; } };
  const progress = { textContent: "" };
  const download = { hidden: true, addEventListener: (_name, handler) => { handlers.download = handler; } };
  let blob;
  let clicked = false;
  let revoked = false;
  const link = { click: () => { clicked = true; }, remove() {} };
  vm.runInNewContext(source.slice(start, end) + "\ninitCompatibilityChecklist();", {
    document: {
      querySelector: (selector) => ({ "#compatibilityChecklist": fieldset, "#checklistProgress": progress, "#downloadChecklist": download })[selector],
      createElement: () => link, body: { append() {} },
    },
    trackEvent: (name) => events.push(name), Blob,
    URL: { createObjectURL: (value) => { blob = value; return "blob:isolated-fixture"; }, revokeObjectURL: () => { revoked = true; } },
    window: { setTimeout: (handler) => handler() },
  });
  assert.equal(download.hidden, false);
  boxes[0].checked = true;
  handlers.change();
  assert.match(progress.textContent, /^1 de 6/);
  boxes.forEach((box) => { box.checked = true; });
  handlers.change(); handlers.change();
  assert.match(progress.textContent, /^6 de 6/);
  assert.deepEqual(events, ["checklist_start", "checklist_complete"]);
  handlers.download();
  assert.equal(clicked, true);
  assert.equal(revoked, true);
  assert.equal(link.download, "neural-x-checklist-software-musical.txt");
  const text = await blob.text();
  assert.equal((text.match(/\[x\]/g) || []).length, 6);
  assert.match(text, /não testa o computador nem certifica compatibilidade/);
  assert.equal(events.at(-1), "checklist_download");
});
