!macro preInit
	SetRegView 64
	WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "C:\JupyterLab"
	WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "C:\JupyterLab"
!macroend

!macro customInstall
  ExecWait "$INSTDIR\resources\env_installer\JupyterLabAppServer-3.1.10-Windows-x86_64.exe"
!macroend
