import test from "node:test";
import assert from "node:assert/strict";
import {
  MARKER,
  validateNote,
  validateManifest,
  publicNoteFromMR,
  collectPublicNotes,
} from "../scripts/lib/public-build-notes.mjs";
const note = {
  id: "context-starting-point",
  title: "Clearer project context",
  summary: "Start with the relevant guidance.",
  category: "Agent tools",
  href: "/rootweaver/",
};
const mr = {
  iid: 1,
  state: "merged",
  draft: false,
  target_branch: "main",
  labels: ["public-build-note"],
  merged_at: "2026-10-14T10:12:33Z",
  title: "PRIVATE TITLE",
  description: "PRIVATE DESCRIPTION",
  web_url: "https://private.invalid/1",
};
const comment = (input = note, extra = {}) => ({
  id: 1,
  author: { id: 42 },
  system: false,
  body: MARKER + "\n" + JSON.stringify(input),
  created_at: "2026-10-14T11:00:00Z",
  ...extra,
});
test("only approved public fields cross the boundary", () => {
  const out = publicNoteFromMR(mr, [comment()], [42]);
  assert.deepEqual(out, { ...note, date: "2026-10-14" });
  assert.ok(!JSON.stringify(out).includes("PRIVATE"));
});
test("label or general MR prose alone cannot publish", () =>
  assert.equal(publicNoteFromMR(mr, [], [42]), null));
test("wrong author cannot publish", () =>
  assert.equal(
    publicNoteFromMR(mr, [comment(note, { author: { id: 7 } })], [42]),
    null,
  ));
test("system comments cannot publish", () =>
  assert.equal(
    publicNoteFromMR(mr, [comment(note, { system: true })], [42]),
    null,
  ));
test("open, draft, unlabelled and non-main changes stay private", () => {
  for (const override of [
    { state: "opened" },
    { draft: true },
    { labels: [] },
    { target_branch: "experiment" },
  ])
    assert.equal(
      publicNoteFromMR({ ...mr, ...override }, [comment()], [42]),
      null,
    );
});
test("unknown fields including private MR links are rejected", () =>
  assert.throws(() => validateNote({ ...note, mr_url: mr.web_url })));
test("only public site routes are accepted", () => {
  for (const href of [
    "https://private.invalid/a",
    "//private.invalid/a",
    "/rootweaver/?token=x",
    "/adrs/../private/",
    "javascript:alert(1)",
  ])
    assert.throws(() => validateNote({ ...note, href }));
});
test("HTML, credential strings and private addresses are rejected", () => {
  for (const title of [
    "<script>bad</script>",
    "host 192.168.1.2",
    "glpat-sensitiveexample",
    "name@private.invalid",
  ])
    assert.throws(() => validateNote({ ...note, title }));
});
test("latest owner withdrawal removes a note", () =>
  assert.equal(
    publicNoteFromMR(
      mr,
      [
        comment(),
        comment(
          { withdrawn: true },
          { id: 2, created_at: "2026-10-14T12:00:00Z" },
        ),
      ],
      [42],
    ),
    null,
  ));
test("edited wording replaces the same public ID", () =>
  assert.equal(
    publicNoteFromMR(
      mr,
      [
        comment(),
        comment(
          { ...note, title: "Updated public wording" },
          { id: 2, updated_at: "2026-10-15T00:00:00Z" },
        ),
      ],
      [42],
    ).title,
    "Updated public wording",
  ));
test("malformed approval fails closed rather than falling back", () =>
  assert.throws(() =>
    publicNoteFromMR(mr, [comment(note, { body: MARKER + " not json" })], [42]),
  ));
test("duplicate public IDs fail closed", () =>
  assert.throws(() =>
    validateManifest([
      { ...note, date: "2026-10-14" },
      { ...note, date: "2026-10-14" },
    ]),
  ));
test("invalid date fails closed", () =>
  assert.throws(() => validateManifest([{ ...note, date: "2026-02-30" }])));
test("complete empty source yields an empty feed for retraction", async () =>
  assert.deepEqual(
    (
      await collectPublicNotes(
        [{ projectId: 1, approverIds: [42] }],
        async () => [],
      )
    ).entries,
    [],
  ));
test("source failure aborts the export", async () =>
  assert.rejects(
    collectPublicNotes([{ projectId: 1, approverIds: [42] }], async () => {
      throw Error("offline");
    }),
  ));
test("pagination reaches later approved MRs", async () => {
  let calls = [];
  const result = await collectPublicNotes(
    [{ projectId: 1, approverIds: [42] }],
    async (path) => {
      calls.push(path);
      if (path.includes("/notes?")) return [comment()];
      if (path.endsWith("page=1"))
        return Array.from({ length: 100 }, (_, i) => ({
          ...mr,
          iid: i + 1,
          labels: [],
        }));
      return [{ ...mr, iid: 101 }];
    },
  );
  assert.equal(result.entries.length, 1);
  assert.ok(calls.some((p) => p.includes("scope=all&per_page=100&page=2")));
});
