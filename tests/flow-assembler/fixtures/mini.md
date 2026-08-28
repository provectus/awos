---
description: Mini fixture.
argument-hint: '[thing]'
---

<!--
Generator instructions. Never copied into output.
-->

# Mini Flow

Intro naming <awos-slot id="intro.source">the source per §1</awos-slot> inline.

<!-- awos:flow:section=notifications optional -->

## Notifications

<awos-slot id="notifications.body">Per §9: what to post.</awos-slot>

<!-- /awos:flow:section -->

## Fixed

This sentence is fixed prose and must survive byte-exact. See <awos-step-ref stage="second"/>.

<!-- awos:flow:stage=first -->

### <awos-step/>: First

Fixed opening. <awos-slot id="first.body">Per §2: what to do.</awos-slot>

<awos-slot id="first.extra" optional>Per §3: an omittable paragraph.</awos-slot>

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=second optional -->

### <awos-step/>: Second

<awos-slot id="second.body">Per §4: the body.</awos-slot>

<!-- /awos:flow:stage -->

---

<!-- awos:flow:generated date=[YYYY-MM-DD] version=[generator version constant from /awos:flow] source=context/product/delivery-flow.md -->
