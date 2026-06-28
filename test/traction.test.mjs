import { test } from "node:test"
import assert from "node:assert/strict"
import { reduceTraction, leaderboard } from "../lib/traction.js"

const T = "0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd"

test("leaderboard ranks external payers by volume, excludes treasury/self", () => {
	const ledger = [
		{ payer: T, amount: "1000", transaction: "0xa" },
		{ payer: "0xAAAA", amount: "1000", transaction: "0xa" },
		{ payer: "0xAAAA", amount: "1000", transaction: "0xb" },
		{ payer: "0xCCCC", amount: "2000", transaction: "0xb" },
		{ payer: "0xBBBB", amount: "1000", transaction: "0xb" },
	]
	const lb = leaderboard(ledger, { exclude: [T] })
	assert.equal(lb.length, 3)
	assert.equal(lb.find((r) => r.payer === T), undefined)
	assert.equal(lb[0].payer, "0xaaaa")
	assert.equal(lb[0].calls, 2)
	assert.equal(lb[0].micros, "2000")
	assert.equal(lb[2].payer, "0xbbbb")
})

test("leaderboard respects limit and empty ledger", () => {
	assert.deepEqual(leaderboard([]), [])
	const ledger = [
		{ payer: "0x1", amount: "3000", transaction: "0xa" },
		{ payer: "0x2", amount: "2000", transaction: "0xa" },
		{ payer: "0x3", amount: "1000", transaction: "0xa" },
	]
	const lb = leaderboard(ledger, { exclude: ["0xtreasury"], limit: 2 })
	assert.equal(lb.length, 2)
	assert.equal(lb[0].payer, "0x1")
	assert.equal(lb[1].payer, "0x2")
})

test("reduceTraction sums all micros regardless of exclude", () => {
	const ledger = [
		{ payer: T, amount: "1000", transaction: "0xa" },
		{ payer: "0xAAAA", amount: "2000", transaction: "0xa" },
	]
	const t = reduceTraction(ledger, { exclude: [T] })
	assert.equal(t.nano_micros, "3000")
	assert.equal(t.unique_external_payers, 1)
})
