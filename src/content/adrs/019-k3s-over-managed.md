---
id: 19
title: "K3s on the home platform"
sourceKind: historical-note
status: historical
date: 2025-10-05
dateLabel: "5 October 2025 · journal context"
journeyId: "2025-10-12-adr-019-k3s-over-managed-kubernetes-for-the-home-platform"
noteLabel: "K3s"
tags: [historical-note, journal]
episode: season-1-episode-6-k3s-crash-resurrection
public: true
---

## Context

The published journal describes running and recovering a K3s cluster on home hardware. The October recovery exposed the operational cost of owning the control plane, networking and storage.

## Design rationale

K3s gave the project a Kubernetes environment in which to learn and operate the platform. This is a retrospective account of that approach; the journal does not establish a formal ADR-019 acceptance date or the complete topology previously drawn on this page.

## What changed later

The architecture checkpoint on 14 October 2026 records a four-node cluster. Worker nodes and separate backups do not, by themselves, remove a single control-plane failure point. [Explore the dated architecture](/rootweaver/).

## Source and record history

[Read the published episode](/writing/season-1-episode-6-k3s-crash-resurrection/). Website Git history shows this page began as an explicitly labelled example reconstructed from the journal. Its original URL is retained, but the number in that URL is not a canonical ADR identity. Reconciled on 14 October 2026.
