## **1\. Architectural Overview**

Podman Quadlets offer a declarative mechanism for running and managing containerized workloads natively under **systemd**1. Instead of relying on full orchestrators (like Kubernetes) or heavy daemon engines (like Docker Compose), Quadlets integrate with systemd's built-in process management model2.

### **The Fork/Exec Model**

Unlike engines requiring a continuous daemon, Podman operates on a fork/exec model2. The CLI launches container processes directly as children of the calling systemd service process, monitored by a lightweight process called conmon2. This ensures that container resource constraints, logging, and process lifecycles are directly managed by the operating system kernel via systemd and cgroups v22.

### **Generator Execution Flow**

Quadlets are parsed during system boot or when systemctl daemon-reload is executed1.

1. The systemd manager triggers the custom binary /usr/lib/systemd/system-generators/podman-system-generator6.  
2. The generator searches specific rootful/rootless system directories for custom declarative file extensions (e.g., .container, .volume)1.  
3. The generator processes these files and translates their custom configuration blocks (e.g., \[Container\]) into standard systemd .service files inside the transient generator directory /run/systemd/generator/ (or user runtime directory)1.  
4. Systemd reads the newly generated unit files and manages them using traditional systemctl commands1.

### **Unit Persistence & Enabling**

Because the generated systemd services are technically transient, running systemctl enable directly on them is not possible1. To ensure a service starts automatically on system boot, developers must add standard systemd install blocks directly inside the Quadlet files (or via drop-in files)5. The generator manually replicates the symlinking behavior during unit generation5.

## **2\. Standard Search Paths & Target Privilege Modes**

The privilege mode of the target container determines the directories where Quadlet files must be placed. Symbolic links are supported at the base search path levels but are not scanned recursively5.

### **A. Rootful (System-wide) Deployment**

Quadlet files placed in these directories are run with full root permissions.

| Search Path | Precedence | Purpose |
| :---- | :---- | :---- |
| /run/containers/systemd/ | 1 (Highest) | Temporary or runtime-generated testing units1. |
| /etc/containers/systemd/ | 2 | System administrator-defined custom units1. |
| /usr/share/containers/systemd/ | 3 | Distribution-provided packaged default units1. |

### **B. Rootless (User-level) Deployment**

Quadlets placed here run inside the standard user's rootless namespace (UID mappings are performed automatically using subUIDs/subGIDs)2.

| Search Path | Purpose |
| :---- | :---- |
| $XDG\_RUNTIME\_DIR/containers/systemd/ | Temporary/runtime testing user units1. |
| $XDG\_CONFIG\_HOME/containers/systemd/ | Primary location for user configuration (defaults to \~/.config/containers/systemd/)1. |
| /etc/containers/systemd/users/${UID}/ | Admin-defined units restricted to a specific user UID1. |
| /etc/containers/systemd/users/ | Admin-defined units deployed automatically for all users on login5. |
| /usr/share/containers/systemd/users/${UID}/ | Packaged units restricted to a specific user UID1. |
| /usr/share/containers/systemd/users/ | Packaged default units deployed globally for all users1. |

## **3\. All Unit Reference Sections & Complete Option Glossaries**

Quadlet supports multiple file extensions1. Each file type contains standard systemd sections (like \[Unit\], \[Service\], or \[Install\]) which pass through directly to the generated service untouched, as well as a custom Podman section1.

### **A. Container Units (.container using \[Container\] Section)**

This defines and manages the lifecycle of a single container process, translating configuration variables into systemd ExecStart=podman run ... command lines1.

| Key | CLI Equivalent | Description |
| :---- | :---- | :---- |
| AddCapability=CAP | \--cap-add CAP | Adds specified Linux capability. Can be listed multiple times10. |
| AddDevice=/dev/foo | \--device /dev/foo | Maps a host device node. Prefix with \- to ignore errors if host device does not exist10. |
| AddHost=host:ip | \--add-host host:ip | Overrides or adds IP mappings to /etc/hosts. Can be listed multiple times10. |
| Annotation="K=V" | \--annotation "K=V" | Sets custom container OCI annotations. Can be listed multiple times10. |
| AppArmor=profile | \--security-opt apparmor=profile | Sets the AppArmor confinement profile (or unconfined)10. |
| AutoUpdate=registry/local | (Adds label) | Configures the container to pull updates via podman-auto-update (registry or local)7. |
| CgroupsMode=mode | \--cgroups=mode | Specifies container cgroup model. Defaults to split instead of the Podman CLI's enabled1. |
| ContainerName=name | \--name name | Configures custom name. Defaults to systemd-%N1. |
| ContainersConfModule=path | \--module=path | Loads specific custom containers.conf module file. Can be listed multiple times1. |
| DNS=ip | \--dns=ip | Configures container DNS resolver. Can be listed multiple times7. |
| DNSOption=opt | \--dns-option=opt | Custom configuration settings for DNS resolution. Can be listed multiple times7. |
| DNSSearch=domain | \--dns-search domain | Configures target DNS search domain scope. Can be listed multiple times7. |
| DropCapability=CAP | \--cap-drop=CAP | Drops capabilities from the container's default capability set. Defaults to all11. |
| Entrypoint=path | \--entrypoint=path | Overrides the image's default executable entry point1. |
| Environment=K=V | \--env K=V | Standard environment variables. Leaving value blank pulls value from the host env1. |
| EnvironmentFile=path | \--env-file path | Imports environment variables from file. Paths are relative or absolute1. |
| EnvironmentHost=true/false | \--env-host | Forwards all local host process environment variables1. |
| Exec=command | (Appended after image) | Specifies command/arguments inside the container1. |
| ExposeHostPort=port | \--expose port | Exposes a port or range without publishing to the host interface1. |
| GIDMap=mapping | \--gidmap=mapping | Explicit GID configuration when utilizing user namespaces1. |
| GlobalArgs=args | (Before command) | Appends general arguments directly to the global Podman CLI invocation1. |
| Group=gid | \--user UID:gid | Targets numeric GID to execute under inside the container namespace1. |
| GroupAdd=group | \--group-add=group | Joins processes inside container to additional auxiliary groups1. |
| HealthCmd=command | \--health-cmd=command | Command used to determine whether the running process is healthy1. |
| HealthInterval=duration | \--health-interval=dur | Time interval between running diagnostic checks1. |
| HealthLogDestination=path | \--health-log-destination=path | Specifies path where log outputs of diagnostic commands are stored1. |
| HealthMaxLogCount=num | \--health-max-log-count=num | Caps total historic diagnostic command execution log files kept1. |
| HealthMaxLogSize=size | \--health-max-log-size=size | Caps max size of target internal tracking log file1. |
| HealthOnFailure=action | \--health-on-failure=action | Action to run on unhealthy state transition (e.g. kill, restart)1. |
| HealthRetries=num | \--health-retries=num | Diagnostic failures required to flag container unhealthy1. |
| HealthStartPeriod=dur | \--health-start-period=dur | Time after container startup to delay first diagnostic checks1. |
| HealthStartupCmd=cmd | \--health-startup-cmd=cmd | Diagnostic commands executed during container initialization1. |
| HealthStartupInterval=dur | \--health-startup-interval=dur | Diagnostics iteration delay during initialization phases1. |
| HealthStartupRetries=num | \--health-startup-retries=num | Failures tolerated during initial initialization checks1. |
| HealthStartupSuccess=num | \--health-startup-success=num | Successes needed to declare initial startup healthy1. |
| HealthStartupTimeout=dur | \--health-startup-timeout=dur | Timeout before a startup diagnostic iteration is abandoned1. |
| HealthTimeout=duration | \--health-timeout=duration | Timeout threshold for standard health check diagnostics1. |
| HostName=name | \--hostname name | Sets target system host name internally1. |
| HttpProxy=true/false | \--http-proxy=true/false | Disables or modifies automatic forwarding of host proxy variables1. |
| Image=image | (Target image) | Image reference (Required unless using Rootfs=)1. |
| ImageVolume=mode | \--image-volume mode | Volume type logic when processing volumes defined natively in image metadata1. |
| IP=ip | \--ip ip | Overrides DHCP with static IPv41. |
| IP6=ip6 | \--ip6 ip6 | Overrides DHCP with static IPv61. |
| Label="K=V" | \--label "K=V" | Appends metadata tags. Can be listed multiple times1. |
| LogDriver=driver | \--log-driver driver | Configures standard engine output logger mechanism (e.g., journald)1. |
| LogOpt=opt | \--log-opt opt | Configures parameters directly passed to logger engine1. |
| Mask=paths | \--security-opt mask=paths | Restricts container readability of host filesystems1. |
| Memory=limit | \--memory limit | Limits total container memory consumption (e.g. 20g)1. |
| Mount=options | \--mount options | Declares file mounts, including source-less anonymous mounts1. |
| Network=net | \--network net | Sets network. Suffixing .network adds dependencies1. |
| NetworkAlias=alias | \--network-alias alias | Internal hostname lookup alias inside the network1. |
| NoNewPrivileges=t/f | \--security-opt no-new-privileges | Blocks processes from running with escalation privileges1. |
| Notify=true/false | \--sdnotify container | Configures container integration with systemd standard notify loop1. |
| PidsLimit=limit | \--pids-limit limit | Restricts overall process execution capacity1. |
| Pod=pod-name | \--pod=pod-name | Joins container processes into an active shared Pod1. |
| PodmanArgs=args | (Raw arguments) | Appends raw command arguments (unrecognized/unsupported custom keys)1. |
| PublishPort=host:ctr | \--publish host:ctr | Maps host port. Explicitly supports protocol formatting /tcp, /udp1. |
| Pull=policy | \--pull policy | Pull policies: always, missing, never, newer1. |
| ReadOnly=true/false | \--read-only | Sets rootfs as immutable and write-protected1. |
| ReadOnlyTmpfs=t/f | \--read-only-tmpfs | Sets read-only permissions for default container tempfs directories1. |
| ReloadCmd=command | (ExecReload cmd) | Defines systemd reload logic using raw command paths1. |
| ReloadSignal=signal | (ExecReload kill) | Configures reload action by dispatching custom OS signal1. |
| Retry=num | \--retry=num | Number of pull retry attempt phases1. |
| RetryDelay=duration | \--retry-delay=duration | Duration delay spacing retry phases1. |
| Rootfs=path | \--rootfs path | Deploys using a custom absolute directory as rootfs (instead of image)1. |
| RunInit=true/false | \--init | Launches an internal zombie-reaping initialization loop (e.g. tini)1. |
| SeccompProfile=path | \--security-opt seccomp=path | Passes custom system call profiles in JSON1. |
| Secret=name | \--secret=name\[,opts\] | Safely exposes credential files within container environment1. |
| SecurityLabelDisable=t/f | \--security-opt label=disable | Bypasses SELinux labeling separation1. |
| SecurityLabelFileType=type | \--security-opt label=filetype:type | Overrides target SELinux filesystem context type1. |
| SecurityLabelLevel=level | \--security-opt label=level:level | Overrides default container isolation multi-category settings1. |
| SecurityLabelNested=t/f | \--security-opt label=nested | Authorizes execution of multi-layered nested engines1. |
| SecurityLabelType=type | \--security-opt label=type:type | Sets parent execution domain contexts (e.g. spc\_t)1. |
| ServiceName=name | (Unit rename) | Overrides systemd default naming to direct name.service1. |
| ShmSize=size | \--shm-size=size | Changes default host /dev/shm shared block size1. |
| StartWithPod=t/f | (Service dependency) | Triggers execution automatically on companion Pod startup1. |
| StopSignal=signal | \--stop-signal=signal | Custom signal sent on service stop requests (defaults to standard signals)1. |
| StopTimeout=timeout | \--stop-timeout=timeout | Wait time in seconds before running forced hard-kill routines1. |
| SubGIDMap=name | \--subgidname=name | Map system user namespace target ranges from /etc/subgid1. |
| SubUIDMap=name | \--subuidname=name | Map system user namespace target ranges from /etc/subuid1. |
| Sysctl=name=value | \--sysctl=name=value | Sets isolated kernel tuning variables1. |
| Timezone=tz | \--tz tz | Enforces custom timezone mapping (or utilizes local host)1. |
| Tmpfs=path | \--tmpfs path | Sets volatile memory-mapped writable targets1. |
| UIDMap=mapping | \--uidmap=mapping | Explicit user namespace identification mapping1. |
| Ulimit=limit | \--ulimit limit | Imposes OS limit constraints directly on target container actions1. |
| Unmask=paths | \--security-opt unmask=paths | Exempts standard restricted kernel mount paths from unreadable masking1. |
| User=uid | \--user uid | Run process as user UID inside the container1. |
| UserNS=mode | \--userns mode | User namespace configuration profile1. |
| Volume=src:dest | \--volume src:dest | Volume mount. Directly integrates local systems, paths, and .volume units11. |
| WorkingDir=path | \--workdir path | Sets active execution path internally20. |

### **B. Volume Units (.volume using \[Volume\] Section)**

Volume files declare and guarantee the persistence of named local storage spaces independent of container execution scopes1.

| Key | CLI Equivalent | Description |
| :---- | :---- | :---- |
| Copy=yes/no | \--opt copy | Automatically duplicates local image paths to volume on first creation (defaults to yes)11. |
| Device=path | \--opt device=path | Path of host hardware device partition11. |
| Group=gid/name | \--gid=gid | Linux GID mapping assigned during directory generation11. |
| Label=K=V | \--label K=V | Appends metadata tags. Can be listed multiple times11. |
| Options=opts | \--opt o=opts | Mount options compatible with the native Linux mount utility9. |
| Type=type | \--opt type=type | Specifies standard filesystem structures (e.g. ext4, tmpfs)11. |
| User=uid/name | \--uid=uid | Linux UID mapping assigned during directory generation11. |
| VolumeName=name | (Volume name) | Explicit volume label. Defaults to systemd-%N21. |
| ServiceName=name | (Unit rename) | Custom generated systemd target unit name18. |
| UID=uid | \--uid=uid | System numeric UID assigned directly for user mapping actions9. |
| GID=gid | \--gid=gid | System numeric GID assigned directly for user mapping actions9. |

### **C. Network Units (.network using \[Network\] Section)**

This declares and generates customizable bridged, macvlan, or ipvlan internal software communication networks11.

| Key | CLI Equivalent | Description |
| :---- | :---- | :---- |
| DisableDNS=yes/no | \--disable-dns | Deactivates automated local cluster hostname resolution11. |
| Driver=driver | \--driver driver | Network types: bridge, macvlan, or ipvlan11. |
| Gateway=ip | \--gateway ip | Custom IPv4 or IPv6 gateway routing address11. |
| Internal=yes/no | \--internal | Restricts all external network communication capabilities11. |
| IPAMDriver=driver | \--ipam-driver driver | Custom IP Allocation management engine11. |
| IPRange=cidr | \--ip-range cidr | Sub-allocation boundary parameters11. |
| IPv6=yes/no | \--ipv6 | Activates dual-stack IP behavior on interface drivers11. |
| Label=K=V | \--label K=V | Appends metadata tags. Can be listed multiple times11. |
| Options=opts | \--opt opts | Pass driver-specific option blocks directly11. |
| Subnet=cidr | \--subnet cidr | Network address segment parameters11. |
| ServiceName=name | (Unit rename) | Custom generated systemd target unit name18. |
| InterfaceName=name | \--opt interface=name | Explicit interface hardware mapping identifier12. |

### **D. Kubernetes Units (.kube using \[Kube\] Section)**

Allows systemd to manage execution lifecycles of container pods defined inside Kubernetes manifest YAML files4.

| Key | CLI Equivalent | Description |
| :---- | :---- | :---- |
| Yaml=path | (Manifest source) | File source. Fully supports loading multiple independent files15. |
| ConfigMap=path | \--configmap path | Path of variables used to populate manifest variables11. |
| ExitCodePropagation=mode | \--exit-code-propagation | Defines systemd process monitoring rules: all, any, or none19. |
| LogDriver=driver | \--log-driver driver | Engine output management module19. |
| Mask=paths | \--security-opt mask=paths | Host isolation paths19. |
| Network=net | \--network net | Integrates specific networking. Ends with .network to link to network units11. |
| PodmanArgs=args | (Raw arguments) | Directly inserts additional arguments inside parsing loop19. |
| PublishPort=port | \--publish port | Custom physical port mappings11. |
| RemapGid=mapping | \--gidmap=mapping | Namespace numeric user identification mapping11. |
| RemapUid=mapping | \--uidmap=mapping | Namespace numeric user identification mapping11. |
| RemapUidSize=size | \--uidmap size | Auto allocation boundaries11. |
| ServiceName=name | (Unit rename) | Custom generated systemd target unit name18. |
| Unmask=paths | \--security-opt unmask=paths | Releases paths blocked by default container isolation mechanisms19. |
| UserNS=mode | \--userns mode | Namespace privilege profile19. |

### **E. Pod Units (.pod using \[Pod\] Section)**

Establishes a shared boundary namespace environment where multiple containers can run collaboratively as a logical group.

| Key | CLI Equivalent | Description |
| :---- | :---- | :---- |
| PodName=name | \--name name | Configures custom pod name. Defaults to systemd-%N12. |
| ServiceName=name | (Unit rename) | Custom generated systemd target unit name18. |
| Label=K=V | \--label K=V | Appends metadata tags to pod namespace12. |
| ExitPolicy=policy | \--exit-policy policy | Configures policy when containers in the pod exit12. |
| StopTimeout=sec | \--stop-timeout sec | Sets shutdown termination delay in seconds15. |

### **F. Build Units (.build using \[Build\] Section)**

Generates service files that compile container images on the local host using a Containerfile17.

| Key | CLI Equivalent | Description |
| :---- | :---- | :---- |
| ImageTag=name | \-t name | Defines tag assigned to compiled output image17. |
| File=path | \-f path | File path of Containerfile17. |
| SetWorkingDirectory=path | (WorkingDirectory) | System path context or Git URL17. |
| Secret=secret | \--secret secret | Safely maps credential keys during compilation stages17. |
| Annotation=K=V | \--annotation K=V | Attaches image annotations17. |
| Arch=arch | \--arch arch | Target architecture17. |
| AuthFile=path | \--authfile path | Target registry credentials file17. |
| ContainersConfModule=path | \--module path | Custom execution engine modifications17. |
| GroupAdd=group | \--group-add group | Adds compilation privileges inside context containers17. |
| Label=K=V | \--label K=V | Appends metadata labels17. |
| Network=mode | \--network mode | Networking options during compiler execution17. |
| PodmanArgs=args | (Raw arguments) | Appends custom build parameters17. |
| Pull=policy | \--pull policy | Pull validation logic during build checks17. |
| Retry=num | \--retry num | Pull validation attempt retry spacing checks17. |
| RetryDelay=duration | \--retry-delay duration | Time interval delay spacing retry actions17. |
| Target=stage | \--target stage | Targets specific intermediate compilation step ranges17. |
| ServiceName=name | (Unit rename) | Custom generated systemd target unit name18. |
| BuildArg=arg | \--build-arg arg | Passes variables to Containerfile parameters15. |
| IgnoreFile=path | \--ignorefile path | Path of compile exclusion definition file15. |

### **G. Image Units (.image using \[Image\] Section)**

Pulls, validates, and locally registers container images prior to utilization by dependencies1.

| Key | CLI Equivalent | Description |
| :---- | :---- | :---- |
| ImageName=name | (Pull target) | Target image identifier to pull. |
| ServiceName=name | (Unit rename) | Custom generated systemd target unit name18. |
| Policy=policy | (Pull policy) | Pull options: always, missing, never, newer12. |
| AuthFile=path | \--authfile path | Authentication verification credential tracking path. |
| CertDir=path | \--cert-dir path | Root authority verification path location. |
| Creds=user:password | \--creds creds | Explicit remote access verification properties. |
| DecryptionKey=key | \--decryption-key key | Cryptographic image decoding verification key. |
| Insecure=yes/no | \--tls-verify=false | Disables engine security verification warnings. |
| TLSVerify=yes/no | \--tls-verify | Requires encrypted TLS validation during connections. |
| Variant=variant | \--variant variant | Compiles targeting specific CPU execution models. |
| AllTags=yes/no | \--all-tags | Forces engine to retrieve all image tags. |
| Arch=arch | \--arch arch | CPU architecture validation filters. |
| OS=os | \--os os | OS target validation filters. |

### **H. Artifact Units (.artifact using \[Artifact\] Section)**

Enables pulling and extracting OCI artifacts into local paths1.

| Key | CLI Equivalent | Description |
| :---- | :---- | :---- |
| ServiceName=name | (Unit rename) | Custom generated systemd target unit name18. |

## **4\. Systemd & Quadlet CLI Management Commands**

Rather than manually manipulating the files under /run/systemd/generator, Quadlets are designed to be managed natively through helper commands1.

### **Command Translation & Directives**

Bash  
\# Force the systemd generator to re-scan directories and compile services  
\# Rootful:  
sudo systemctl daemon-reload \[cite: 23\]  
\# Rootless:  
systemctl \--user daemon-reload \[cite: 23\]

\# View the raw, parsed systemd service generated from a Quadlet file  
\# Rootful:  
systemctl cat \<name\>.service  
\# Rootless:  
systemctl \--user cat \<name\>.service

\# Control lifecycles  
\# Rootful:  
sudo systemctl start \<name\>.service \[cite: 23\]  
sudo systemctl stop \<name\>.service \[cite: 23\]  
sudo systemctl status \<name\>.service \[cite: 23\]  
\# Rootless:  
systemctl \--user start \<name\>.service \[cite: 23\]  
systemctl \--user stop \<name\>.service \[cite: 23\]  
systemctl \--user status \<name\>.service \[cite: 23\]

### **The Native podman quadlet CLI Utility**

Modern versions of Podman ship with a built-in command suite specifically for debugging, creating, and removing Quadlets3.

Bash  
\# 1\. DRY-RUN Unit Generation (troubleshoot before applying)  
\# Generates and prints the standard systemd code blocks to stdout  
\# Rootful:  
podman quadlet print /etc/containers/systemd/example.container  
\# Rootless:  
podman quadlet print \~/.config/containers/systemd/example.container

\# Legacy equivalent generator dry-runs:  
/usr/libexec/podman/quadlet \-dryrun \[cite: 23\]  
/usr/libexec/podman/quadlet \-dryrun \-user \[cite: 23\]

\# 2\. List all discovered Quadlet units and their companion systemd services  
podman quadlet list  
\# Alias:  
podman quadlet ls \[cite: 3, 9\]  
\# Useful options:  
podman quadlet list \--noheading \# Strips print tables of title lines  
podman quadlet list \--filter status=active \# Search specific units

\# 3\. Native install management  
\# Copies a file into the correct target systemd location and triggers reloading  
podman quadlet install /path/to/my.container  
\# Force install, replacing existing names  
podman quadlet install \--replace /path/to/my.container \[cite: 15, 24\]

\# 4\. Uninstall a Quadlet unit  
podman quadlet rm my.container \[cite: 3\]

## **5\. Step-by-Step Transition & Multi-Container Deployment Examples**

### **Example A: Translating a podman run Command to Quadlets**

Here is a classic setup: an Nginx proxy connected to a database container, mounting persistent storage, using custom bridged networks, and isolated inside rootless namespaces2.

#### **Native podman run commands:**

Bash  
podman network create app-net  
podman volume create db-data  
podman run \-d \--name mariadb \--net app-net \-v db-data:/var/lib/mysql \-e MYSQL\_ROOT\_PASSWORD=secret mariadb:latest  
podman run \-d \--name web \-p 8080:80 \--net app-net nginx:alpine

#### **Quadlet Declarative Equivalents:**

Create app-net.network inside \~/.config/containers/systemd/:

Ini, TOML  
\[Network\]  
Driver=bridge

Create db-data.volume inside \~/.config/containers/systemd/:

Ini, TOML  
\[Volume\]  
Label=purpose=production

Create mariadb.container inside \~/.config/containers/systemd/:

Ini, TOML  
\[Unit\]  
Description=Database Engine Service  
After=app-net-network.service db-data-volume.service  
Requires=app-net-network.service db-data-volume.service

\[Container\]  
Image=docker.io/library/mariadb:latest  
ContainerName=mariadb  
Network=app-net.network  
Volume=db-data.volume:/var/lib/mysql:Z  
Environment=MYSQL\_ROOT\_PASSWORD=secret

\[Install\]  
WantedBy=default.target

Create web.container inside \~/.config/containers/systemd/:

Ini, TOML  
\[Unit\]  
Description=Frontend Proxy Server  
After=mariadb.service  
Requires=mariadb.service

\[Container\]  
Image=docker.io/library/nginx:alpine  
ContainerName=web  
Network=app-net.network  
PublishPort=8080:80

\[Install\]  
WantedBy=default.target

To load and initialize this stack:

Bash  
systemctl \--user daemon-reload \[cite: 23\]  
systemctl \--user start web.service \[cite: 23\]

Systemd will automatically detect dependencies, launch the custom bridged network and database volume, verify the container states, pull required images, and start the frontend container1.

### **Example B: Secure Socket Activation Deployment**

In this advanced setup, systemd binds directly to port 8080 on the host, spawning a socket6. As soon as incoming requests target port 8080, systemd immediately triggers the container, passing the active socket descriptor directly6. The container uses Network=none to completely block arbitrary network communication6.  
Create app-web.socket inside \~/.config/systemd/user/:

Ini, TOML  
\[Unit\]  
Description=Secure Activated Web Socket

\[Socket\]  
ListenStream=8080

\[Install\]  
WantedBy=sockets.target

Create app-web.container inside \~/.config/containers/systemd/:

Ini, TOML  
\[Unit\]  
Description=Socket-Activated Microservice  
Requires=app-web.socket  
After=app-web.socket

\[Container\]  
Image=ghcr.io/eriksjolund/socket-activate-echo  
Network=none

\[Install\]  
WantedBy=default.target

Activate the socket (the container will remain offline until a request arrives):

Bash  
systemctl \--user daemon-reload  
systemctl \--user start app-web.socket \[cite: 25\]

## **6\. Common Failures & Diagnostic Troubleshooting**

### **A. Image Pull and Build Timeout Failures**

* **Symptom:** Services fail with TimeoutStartSec errors during start operations1.  
* **Cause:** When units initialize, Podman may check registries and pull or build large container images, which can exceed systemd's default 90-second service initialization limit1.  
* **Fix:** Manually set a high or unlimited startup timeout limit within the custom file's \[Service\] section1:  
  Ini, TOML  
  \[Service\]  
  TimeoutStartSec=15m

  *Note:* Avoid combining TimeoutStartSec with Type=oneshot (such as inside volume, network, or image units), as systemd defaults oneshot services to an infinite timeout1.

### **B. Containers Terminating Automatically on Logout**

* **Symptom:** User containers exit abruptly when standard terminal SSH sessions close6.  
* **Cause:** By default, systemd halts rootless user managers and terminates standard user container processes immediately upon logout6.  
* **Fix:** Enable lingering for the rootless user account6:  
  Bash  
  sudo loginctl enable-linger $USER

### **C. Permission Denied Errors with Subdirectories**

* **Symptom:** Service startup attempts halt with generic filesystem permission denials27.  
* **Cause:** Rootless engines attempt container operations inside target directory targets mounted under security layers configured as noexec27.  
* **Fix:** Copy /etc/containers/storage.conf to \~/.config/containers/storage.conf and adjust variables targeting directories outside noexec mounts27.

### **D. Systemctl Fails to Locate Generated Service Units**

* **Symptom:** Running systemctl start myapp.service prints Unit myapp.service not found21.  
* **Cause:** The generator failed to parse the Quadlet file, likely due to a syntax error21.  
* **Fix:** Utilize systemd diagnostic parser verification commands to isolate errors21:  
  Bash  
  systemd-analyze \--user \--generators=true verify myapp.service

### **E. Host Path Mounting Security Errors (SELinux)**

* **Symptom:** Permission denied errors inside the container when attempting to access host-mounted files or directories27.  
* **Cause:** Host filesystems mounted into rootless containers must be explicitly labeled to match the container's SELinux execution contexts8.  
* **Fix:** Add a :z suffix to allow shared read/write access across multiple containers, or :Z to grant exclusive private read/write access to the specific container2.  
  Ini, TOML  
  \[Container\]  
  Volume=/home/user/app-data:/mnt/data:Z

#### **Works cited**

1. podman-systemd.unit, [https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html](https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html)  
2. Getting Started with Podman Quadlets | Twilio, [https://www.twilio.com/en-us/blog/developers/tutorials/building-blocks/getting-started-with-podman-quadlets](https://www.twilio.com/en-us/blog/developers/tutorials/building-blocks/getting-started-with-podman-quadlets)  
3. podman-quadlet, [https://docs.podman.io/en/latest/markdown/podman-quadlet.1.html](https://docs.podman.io/en/latest/markdown/podman-quadlet.1.html)  
4. Make systemd better for Podman with Quadlet \- Red Hat, [https://www.redhat.com/en/blog/quadlet-podman](https://www.redhat.com/en/blog/quadlet-podman)  
5. podman-systemd.unit(5) \- Arch manual pages, [https://man.archlinux.org/man/podman-systemd.unit.5.en](https://man.archlinux.org/man/podman-systemd.unit.5.en)  
6. podman/docs/tutorials/socket\_activation.md at main \- GitHub, [https://github.com/podman-container-tools/podman/blob/main/docs/tutorials/socket\_activation.md](https://github.com/podman-container-tools/podman/blob/main/docs/tutorials/socket_activation.md)  
7. systemd units using Podman Quadlet \- Ubuntu Manpage Repository, [https://manpages.ubuntu.com/manpages/noble/man5/podman-systemd.unit.5.html](https://manpages.ubuntu.com/manpages/noble/man5/podman-systemd.unit.5.html)  
8. podman/docs/source/markdown/podmansh.1.md at main \- GitHub, [https://github.com/containers/podman/blob/main/docs/source/markdown/podmansh.1.md](https://github.com/containers/podman/blob/main/docs/source/markdown/podmansh.1.md)  
9. Releases · podman-container-tools/podman \- GitHub, [https://github.com/podman-container-tools/podman/releases](https://github.com/podman-container-tools/podman/releases)  
10. quadlet(5) — Arch manual pages, [https://man.archlinux.org/man/quadlet.5.en](https://man.archlinux.org/man/quadlet.5.en)  
11. podman-systemd.unit, [https://docs.podman.io/en/v4.4/markdown/podman-systemd.unit.5.html](https://docs.podman.io/en/v4.4/markdown/podman-systemd.unit.5.html)  
12. Podman candidate v5.6.0-rc2 Released, [https://lists.podman.io/archives/list/podman@lists.podman.io/thread/7WTSXMBGOWPW5KBEZTDIMHDRRMY2IFM7/](https://lists.podman.io/archives/list/podman@lists.podman.io/thread/7WTSXMBGOWPW5KBEZTDIMHDRRMY2IFM7/)  
13. podman-systemd.unit, [https://docs.podman.io/en/v4.6.1/markdown/podman-systemd.unit.5.html](https://docs.podman.io/en/v4.6.1/markdown/podman-systemd.unit.5.html)  
14. \[Docs\] podman-systemd.unit man page errors · Issue \#17514 \- GitHub, [https://github.com/containers/podman/issues/17514](https://github.com/containers/podman/issues/17514)  
15. Podman v5.7.0 Released, [https://lists.podman.io/archives/list/podman@lists.podman.io/thread/3FMPZ2UPH5JLG6WONASWRP5RDHPKFK2N/](https://lists.podman.io/archives/list/podman@lists.podman.io/thread/3FMPZ2UPH5JLG6WONASWRP5RDHPKFK2N/)  
16. Documentation: PublishPort does not mention the possibility to define a protocol \#28146, [https://github.com/containers/podman/issues/28146](https://github.com/containers/podman/issues/28146)  
17. podman-build.unit, [https://docs.podman.io/en/latest/markdown/podman-build.unit.5.html](https://docs.podman.io/en/latest/markdown/podman-build.unit.5.html)  
18. option ServiceName should be documented for all quadlet units · Issue \#27015 · containers/podman \- GitHub, [https://github.com/containers/podman/issues/27015](https://github.com/containers/podman/issues/27015)  
19. podman-systemd.unit, [https://docs.podman.io/en/v4.6.0/markdown/podman-systemd.unit.5.html](https://docs.podman.io/en/v4.6.0/markdown/podman-systemd.unit.5.html)  
20. podman-systemd.unit, [https://docs.podman.io/en/v5.0.1/markdown/podman-systemd.unit.5.html](https://docs.podman.io/en/v5.0.1/markdown/podman-systemd.unit.5.html)  
21. podman-quadlet-basic-usage, [https://docs.podman.io/en/latest/markdown/podman-quadlet-basic-usage.7.html](https://docs.podman.io/en/latest/markdown/podman-quadlet-basic-usage.7.html)  
22. quadlet package \- github.com/containers/podman/v5/pkg/systemd/quadlet \- Go Packages, [https://pkg.go.dev/github.com/containers/podman/v5/pkg/systemd/quadlet](https://pkg.go.dev/github.com/containers/podman/v5/pkg/systemd/quadlet)  
23. 9 Podman Quadlets \- Oracle Help Center, [https://docs.oracle.com/en/operating-systems/oracle-linux/podman/quadlets.html](https://docs.oracle.com/en/operating-systems/oracle-linux/podman/quadlets.html)  
24. podman-generate-systemd, [https://docs.podman.io/en/v5.2.1/markdown/podman-generate-systemd.1.html](https://docs.podman.io/en/v5.2.1/markdown/podman-generate-systemd.1.html)  
25. podman/troubleshooting.md at main · podman-container-tools/podman \- GitHub, [https://github.com/containers/podman/blob/main/troubleshooting.md](https://github.com/containers/podman/blob/main/troubleshooting.md)