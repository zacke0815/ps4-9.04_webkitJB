pragma once
define kernel_offset_xfast_syscall 0x1c0
define kernel_offset_allproc 0x1b946e0
define kernel_offset_vmspace_acquire_ref 0x7b9e0
define kernel_offset_vmspace_free 0x7b810
define kernel_offset_printf 0xb7a30
define kernel_offset_kmem_alloc 0x37be70
define kernel_offset_kernel_map 0x2268d48
define kernel_offset_sysent 0x1100310
define kernel_offset_proc_rwmem 0x41eb00
define kernel_offset_copyin 0x2716a0

define kernel_patch_kmem_alloc_1 0x37bf3c
define kernel_patch_kmem_alloc_2 0x37bf44
