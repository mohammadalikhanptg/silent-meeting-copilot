# SMC orchestration — Worker 2 (DEV-ORCH-02) cutover runbook

Purpose: let SMC orchestration run from DEV-ORCH-02 (Worker 2, 10.101.101.152, user pacificops) with the same reach the Worker 1 setup has, in particular direct access to the Linux bot host SMC-LINUX-BOT (ptg-linux-vm, 10.101.101.56).

## Verified topology (established 5 Jul 2026 from Worker 1)

- DEV-ORCH-01 (Worker 1): physical Windows host, Hyper-V hypervisor, 10.101.101.150, user MohammadAliKhan.
- DEV-ORCH-02 (Worker 2): Hyper-V guest on Worker 1, 10.101.101.152, user pacificops. Target orchestration home.
- SMC-LINUX-BOT (ptg-linux-vm): Hyper-V Gen2 guest on Worker 1, 10.101.101.56, user ptg. Bot build/run host.
- All three are on the same 10.101.101.0/24 subnet (Pacific-External switch). Worker 1 to Worker 2 ping confirmed. Linux VM sshd listens on 0.0.0.0:22, reachable from any subnet host including Worker 2.

## The critical finding

The Worker 1 to Linux exec channel is plain SSH over the LAN, not Hyper-V PowerShell Direct. Worker 1 uses two scheduled tasks (smc-vmrun, smc-vmcopy) that simply wrap:

    ssh.exe  -i <key> ptg@10.101.101.56 "bash -s"   < cmd.sh
    scp.exe  -i <key> <payload> ptg@10.101.101.56:/home/ptg/smc-in/

Because the transport is SSH over the network, it is fully portable to Worker 2. Worker 2 does not need to be the Hyper-V host. It needs: (1) an SSH private key authorised on the Linux VM, (2) the OpenSSH client (built into Windows Server), (3) network reachability to 10.101.101.56 (already present on-subnet).

The Worker 1 SSH key is C:\Users\MohammadAliKhan\.ssh\id_ed25519_smcbot, owned by AzureAD\MohammadAliKhan. Its public half (already in the VM authorized_keys) is:

    ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBhMcIlF7lyEtCFMb2olHLl4FiVQD+w2dRVsvT836tYB smc-linux-bot-access

Recommendation: do NOT copy Worker 1's private key to Worker 2. Generate a dedicated Worker 2 key and append its public half to the VM authorized_keys. Cleaner revocation, no shared secret across hosts.

## Linux VM state as of 5 Jul 2026

- Toolchain complete: cmake, g++, python3, jq, curl, git all present. Can build the bot v2 in place.
- Present: /home/ptg/smc-bot/{adapter,run-bot.sh,sdk}; built v1 binaries adapter/build/{auth_smoke,join_bot} (dated 5 Jul 01:40 to 02:05); /home/ptg/.smc/zoom.env (mode 600).
- NOT present yet: repo clone on the VM (REPO-NO), /home/ptg/.smc/bot-queue.env (BOT_QUEUE_SECRET not on VM), the v2 poller (bot/poller), any systemd user unit. These are the remaining bot-integration install steps, independent of the Worker 2 move.
- authorized_keys currently has 1 entry (the Worker 1 smcbot key).

## Worker 2 setup checklist (run on DEV-ORCH-02 as pacificops)

1. Confirm OpenSSH client: `Get-Command ssh.exe` should resolve to C:\Windows\System32\OpenSSH\ssh.exe. If missing, `Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0`.
2. Generate a dedicated key: `ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\id_ed25519_smcbot_w2 -C "w2-smc-linux-bot-access" -N '""'`.
3. Authorise it on the VM: append the new .pub line to /home/ptg/.ssh/authorized_keys on 10.101.101.56 (one-time, via the existing Worker 1 channel or console).
4. Verify from Worker 2: `ssh -i $env:USERPROFILE\.ssh\id_ed25519_smcbot_w2 -o StrictHostKeyChecking=accept-new ptg@10.101.101.56 "hostname; whoami"` should return ptg-linux-vm / ptg.
5. Recreate the two exec-channel scripts and scheduled tasks under the pacificops profile, pointing at the Worker 2 key. Scripts are trivial (see vmrun.ps1 / vmcopy.ps1 pattern above). Alternatively skip the scheduled-task relay entirely and drive the VM directly with pwsh_ssh from the Worker 2 bridge, which is simpler if the bridge SSH-under-service quirk (below) is resolved.
6. Ensure the pwsh-bridge and mac-bridge MCP configs exist in the Worker 2 Claude Desktop so the same toolset is available.

## Known bridge quirk to resolve for Worker 2

From Worker 1, direct pwsh_ssh and inline ssh.exe from the bridge returned exit 255 with no stderr, while the scheduled-task path (same key, same host) works. This is the documented ssh-under-non-interactive-service exit-255 pattern. On Worker 2 either (a) keep the scheduled-task relay pattern, which sidesteps it, or (b) fix the bridge service context so ssh.exe can read the key and known_hosts non-interactively (pre-seed known_hosts, confirm the service account owns the key with correct ACL). Prefer (a) for reliability unless the Skill Maintenance project hardens (b).

## Remaining bot-integration install (independent of the Worker 2 move, needs BOT_QUEUE_SECRET on the VM)

Once BOT_QUEUE_SECRET is on the VM at /home/ptg/.smc/bot-queue.env (mode 600, same value as Vercel), plus APP_BASE_URL:
1. Clone or fetch the repo on the VM, checkout main.
2. Rebuild the adapter (cmake) so join_bot v2 replaces the v1 binary.
3. Install bot/poller/smc-bot-poller.sh and the systemd user unit; enable it.
4. Live-join test from a real meeting to prove the v2 waiting-room and PASSCODE-REQUIRED paths.
