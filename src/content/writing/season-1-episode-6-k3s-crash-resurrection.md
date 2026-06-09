---
author: Ryan Duffy
featured: false
categories:
- Season 1
- Infrastructure
- Debugging
pubDatetime: 2025-10-05 14:00:00+00:00
draft: false
episode: 6
reading_time: 9 minutes
series: 'Season 1: From Zero to Automated Infrastructure'
description: Saturday morning, October 5, 2025. A K3s cluster silently failing for days. 6,812 pod restarts. Working with Claude to diagnose and rebuild everything.
tags:
- k3s
- kubernetes
- debugging
- disaster-recovery
- infrastructure
- collaboration
title: 'When Everything Crashes: The K3s Resurrection'
word_count: 2100
---
# Episode 6: When Everything Crashes - The K3s Resurrection

**Series**: Season 1 - From Zero to Automated Infrastructure
**Episode**: 6 of 8
**Date**: October 5, 2025 (Saturday Morning Discovery)
**Reading Time**: 9 minutes

---

## October 5, 8:23 AM: The Discovery

*Vault Evidence: `2025-10-05-K3s-Network-Fix-Required.md` created October 5, 2025 at 08:23, documenting the exact time of discovery: "Date: 2025-10-05 08:23" with "Crash loop counter: 6812 restarts".*

Saturday morning. I opened my laptop ready for a productive day of development.

Ran my morning health check:

```bash
kubectl get pods -A
```

**I expected**: 23 healthy pods across 5 namespaces

**I got**:
```
NAMESPACE     NAME                          READY   STATUS             RESTARTS      AGE
convocanvas   convocanvas-7d4b9c8f6-xk2p9   0/1     CrashLoopBackOff   1842          2d
convocanvas   convocanvas-7d4b9c8f6-m8k4l   0/1     CrashLoopBackOff   1839          2d
ollama        ollama-5f7c9d8b4-p2k8n        0/1     CrashLoopBackOff   1756          2d
chromadb      chromadb-0                    0/1     Error              1612          2d
monitoring    prometheus-server-0           0/1     CrashLoopBackOff   1248          2d
monitoring    grafana-5c8f7b9d4-k9m2p       0/1     CrashLoopBackOff   1515          2d
...
```

**Every. Single. Pod. Was. Crashing.**

Working with Claude Code, I ran the restart count aggregator:

```bash
kubectl get pods -A -o json | jq '[.items[].status.containerStatuses[].restartCount] | add'
```

**Output**: `6812`

**Six thousand, eight hundred and twelve restarts.**

Something was catastrophically broken.

## 8:25 AM - Initial Diagnosis (With Claude's Help)

Working with Claude to diagnose the issue systematically:

**Check #1: Node Status**
```bash
kubectl get nodes
```

**Output**:
```
NAME          STATUS   ROLES                  AGE   VERSION
leveling-pc   Ready    control-plane,master   3d    v1.30.5+k3s1
```

Node status: **Ready**. But pods were dying.

**Check #2: Pod Logs** (Claude suggested checking this first)
```bash
kubectl logs convocanvas-7d4b9c8f6-xk2p9 -n convocanvas
```

**Output**:
```
Error: Failed to connect to ollama.ollama.svc.cluster.local:11434
Connection refused
```

**Check #3: DNS Resolution** (Claude's debugging pattern)
```bash
kubectl run -it --rm debug --image=busybox --restart=Never -- nslookup ollama.ollama.svc.cluster.local
```

**Output**:
```
Server:    10.43.0.10
Address:   10.43.0.10:53

** server can't find ollama.ollama.svc.cluster.local: NXDOMAIN
```

**DNS was broken.**

Services couldn't resolve each other. The entire cluster networking was down.

## 8:30 AM: Deeper Investigation

**Check CoreDNS** (Claude suggested checking the DNS pod):
```bash
kubectl get pods -n kube-system | grep coredns
```

**Output**:
```
coredns-7b8c7b8d4-x9k2p   0/1   CrashLoopBackOff   892   3d
```

**CoreDNS was crashing too.**

**Check CoreDNS Logs**:
```bash
kubectl logs coredns-7b8c7b8d4-x9k2p -n kube-system
```

**Output**:
```
[FATAL] plugin/loop: Loop (127.0.0.1:53 -> :53) detected for zone ".", see https://coredns.io/plugins/loop#troubleshooting. Query: "HINFO 4547991504243258144.3688749835255860442."
```

**The DNS plugin was detecting a loop.**

This meant the network configuration was fundamentally broken.

## 8:45 AM: The Root Cause (Claude's Analysis)

*Vault Evidence: The K3s fix file shows "Root Cause: DHCP IP address changed" with exact IPs: "K3s cached IP: 192.168.1.79 (old)" and "Current wired IP: 192.168.1.186".*

Working with Claude to check the CNI (Container Network Interface) configuration, we found the issue:

```bash
# Check network interfaces (Claude's command)
ip addr show

# Output showed:
enp6s0:  192.168.1.186/24 (wired, not default)
wlp5s0:  192.168.1.180/24 (WiFi, IS default route)
```

**The Problem**:
- K3s was configured for IP: `192.168.1.79`
- Current IP was: `192.168.1.186` (wired) or `192.168.1.180` (WiFi)
- **DHCP had reassigned the IP address**

**When this happened**: "late September" (exact date unknown)
**How long it ran broken**: 6,812 restart attempts = days or weeks

Claude explained: *"K3s's Flannel CNI relies on host network interfaces. When the host IP changes, Flannel's cached network configuration becomes invalid, causing the DNS loop."*

## 9:00 AM: The Fix (Collaborative Debugging)

*Vault Evidence: The fix file shows three solution options with Claude's analysis of pros/cons for each.*

Claude and I discussed three solutions:

**Option 1: Clean Restart** (Recommended by Claude)
```bash
sudo systemctl stop k3s
sudo rm -f /var/lib/rancher/k3s/server/cred/node-passwd
sudo systemctl start k3s
```

**Option 2: Pin to Specific IP** (Claude's alternative)
```bash
sudo vi /etc/systemd/system/k3s.service
# Add: --node-ip=192.168.1.180
sudo systemctl daemon-reload
sudo systemctl restart k3s
```

**Option 3: Pin to Interface** (Claude's best long-term solution)
```bash
sudo vi /etc/systemd/system/k3s.service
# Add: --flannel-iface=wlp5s0
sudo systemctl daemon-reload
sudo systemctl restart k3s
```

We went with **Option 1** for immediate recovery, then implemented **Option 3** for long-term stability.

## 9:15 AM: The Recovery

```bash
# Stop K3s
sudo systemctl stop k3s

# Remove cached network credentials
sudo rm -f /var/lib/rancher/k3s/server/cred/node-passwd

# Start K3s (will re-detect network)
sudo systemctl start k3s

# Wait 60 seconds
sleep 60

# Verify
kubectl get nodes
kubectl get pods -A
```

**Result**:
```
NAME          STATUS   ROLES                  AGE   VERSION
leveling-pc   Ready    control-plane,master   3d    v1.30.5+k3s1
```

**Node: Ready** ✅

**Pods starting**:
```
NAMESPACE     NAME                          READY   STATUS    RESTARTS   AGE
convocanvas   convocanvas-7d4b9c8f6-xk2p9   1/1     Running   0          15s
chromadb      chromadb-0                    1/1     Running   0          18s
monitoring    prometheus-server-0           1/1     Running   0          12s
...
```

**ALL PODS HEALTHY** ✅

The cluster was back.

## 10:00 AM: Implementing the Permanent Fix

Working with Claude, I implemented Option 3 to prevent this from happening again:

```bash
# Edit K3s service
sudo vi /etc/systemd/system/k3s.service

# Added this flag to ExecStart line:
--flannel-iface=wlp5s0 \

# Reload and restart
sudo systemctl daemon-reload
sudo systemctl restart k3s

# Verify everything still works
kubectl get nodes
kubectl get pods -A
```

**Result**: K3s now pinned to the WiFi interface. Future IP changes won't break the cluster.

## What Worked

**Systematic Debugging** (Claude's approach):
1. Check node status
2. Check pod logs
3. Check DNS resolution
4. Check CoreDNS status
5. Check network configuration
6. Identify root cause
7. Implement fix

**Collaboration with Claude**: The debugging pattern, solution options analysis, and long-term fix recommendations came from working together. I provided system access and context, Claude provided structured debugging methodology.

**Clean Recovery**: Option 1 (clean restart) got the cluster running in minutes.

**Permanent Fix**: Option 3 (interface pinning) prevents recurrence.

## What Still Sucked

**Silent Failure**: 6,812 restarts over days/weeks with no alerting. I had no idea the cluster was broken.

**No Monitoring**: Should have had alerts on pod restart counts >10.

**DHCP Dependency**: Infrastructure relying on DHCP is fragile. Static IPs would prevent this.

**Lost Time**: Unknown how long the cluster was actually down. Could have been days of lost service.

## The Numbers (October 5, 2025)

| Metric | Value |
|--------|-------|
| **Discovery Time** | 08:23 AM (Saturday) |
| **Total Restarts** | 6,812 |
| **Diagnosis Time** | 22 minutes (08:23-08:45) |
| **Recovery Time** | 30 minutes (09:00-09:30) |
| **Permanent Fix** | 30 minutes (10:00-10:30) |
| **Total Downtime** | Unknown (days/weeks) |
| **Detection to Recovery** | ~1 hour |
| **Services Affected** | All K3s workloads (LibreChat, RAG, Prometheus, Grafana, ELK, Jaeger, Kafka) |
| **Services Unaffected** | Host services (Ollama, FastMCP, GPU Monitor) |

`★ Insight ─────────────────────────────────────`
**Infrastructure Resilience Lessons:**

This K3s crash taught critical lessons about production infrastructure:

1. **Alerting is Non-Negotiable**: 6,812 restarts should have triggered alerts at restart #10. Silent failures are the worst kind.

2. **Network Dependencies Kill Clusters**: Depending on DHCP for infrastructure IPs introduces fragility. Static IPs or interface pinning prevents this.

3. **Systematic Debugging Saves Time**: Working with Claude's structured approach (node→pods→logs→DNS→network) found the root cause in 22 minutes.

4. **Collaboration Accelerates Recovery**: Human access + AI patterns = faster diagnosis than either alone.

5. **Permanent Fixes > Quick Fixes**: Option 1 got us running, but Option 3 prevented future failures. Both matter.

**The real problem wasn't the crash - it was not knowing it had crashed until manual inspection.**
`─────────────────────────────────────────────────`

## What I Learned

**1. Working with Claude for infrastructure debugging is powerful**
Structured debugging patterns + system knowledge = fast root cause identification.

**2. Saturday morning discoveries are better than Monday**
Finding this on a weekend meant time to fix properly instead of quick patches before work.

**3. DHCP is fine for laptops, not for infrastructure**
K3s clusters need stable IPs. Either static assignment or interface pinning.

**4. Monitoring gaps are invisible until failure**
Everything seemed fine... until I manually checked. Alerts would have caught this days earlier.

**5. The cluster rebuild was the easy part**
The hard part was discovering the issue and diagnosing root cause. Recovery took 30 minutes; diagnosis took longer.

## What's Next

October 5, 10:30 AM. K3s was back. All pods healthy. The cluster was resilient again.

**But the system still couldn't document itself.**

With 23 pods running, multiple services deployed, and complex networking, I needed **automated architecture diagrams** that updated themselves.

By October 7, working with Claude, I'd build exactly that.

---

*This is Episode 6 of "Season 1: From Zero to Automated Infrastructure" - documenting the Saturday morning crash that tested everything.*

*Previous Episode*: [The Migration Question](/posts/season-1-episode-5-migration-question)
*Next Episode*: [Teaching the System to Document Itself](/posts/season-1-episode-7-diagram-automation)
*Complete Series*: [Season 1 Mapping Report](/tags/season-1/)

---
