# Avisos de Codex

En la aplicación de escritorio, abre Settings → Notifications y elige cuándo recibir avisos de finalización. Permite las notificaciones cuando la aplicación las solicite y revisa que Windows no las silencie. La disponibilidad y los nombres pueden variar por versión. [Documentación oficial de ajustes](https://learn.chatgpt.com/docs/reference/settings#notifications).

Las solicitudes de aprobación aparecen mediante los mecanismos nativos de Codex. Para quien utilice Codex CLI, el archivo de configuración personal puede incluir:

```toml
[tui]
notifications = ["agent-turn-complete", "approval-requested"]
notification_method = "auto"
notification_condition = "always"
```

Los avisos del terminal dependen del soporte de OSC/BEL de la terminal. La opción externa `notify` documentada actualmente atiende finalizaciones; no debe asumirse que cubre todas las aprobaciones. [Configuración oficial](https://learn.chatgpt.com/docs/config-file/config-advanced#notifications).

Este proyecto no modifica la configuración personal de Codex, permisos del sistema ni las notificaciones de Windows. Un prompt no habilita por sí solo esos permisos.
