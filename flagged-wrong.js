'use strict';
// Curated by Harsha after reviewing GitHub issues filed via the quiz's "report wrong" button (see
// app.js's reportKey()/buildReportIssueUrl()). Each entry hides that exact question, corpus-wide,
// for every user — unlike the per-browser sandhiQuizHiddenReports localStorage set, which only
// hides it for the reporter's own browser the instant they submit. To "move a question back" once
// it's fixed, remove its entry here (or fix the underlying data and regenerate) and republish.
window.FLAGGED_WRONG = [];
