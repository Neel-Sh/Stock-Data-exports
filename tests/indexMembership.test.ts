import assert from "node:assert/strict";
import test from "node:test";
import { parseStoxxMembership, stoxxFallbackMembership } from "../lib/indexMembership";

test("STOXX parser reads the official public component table", () => {
  const rows = Array.from({ length: 10 }, (_, index) => `
    <tr><td><a href="component-details?key=${String(index).padStart(6, "0")}">Company ${index}</a></td><td>Technology</td><td>DE</td></tr>
  `).join("");
  const result = parseStoxxMembership(`
    <span>As of Date: Aug. 13, 2026</span>
    <span>Total (600 Components)</span>
    <table><tbody id="components-table-body">${rows}</tbody></table>
  `);
  assert.equal(result.total, 600);
  assert.equal(result.members.length, 10);
  assert.deepEqual(result.members[0], {
    symbol: "STX000000",
    name: "Company 0",
    sector: "Technology",
    industry: "DE",
    dateAdded: null,
    dataSymbol: null,
  });
});

test("STOXX fallback remains a complete verified top-component snapshot", () => {
  const result = stoxxFallbackMembership();
  assert.equal(result.total, 600);
  assert.equal(result.members.length, 10);
  assert.match(result.coverage, /cached/);
  assert.ok(result.members.every((member) => member.dataSymbol === null));
  assert.deepEqual(result.members[0], {
    symbol: "STX546078",
    name: "ASML HLDG",
    sector: "Technology",
    industry: "NL",
    dateAdded: null,
    dataSymbol: null,
  });
});
