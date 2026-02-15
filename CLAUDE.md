# CLAUDE.md — Project Rules

## Project
- **Name**: RandomTime
- **Type**: React Native (Expo) mobile app
- **Language**: TypeScript
- **Stack**: Expo SDK 52, React 18, React Native 0.76

## Rules
- Always use TypeScript with strict mode
- Keep components in a flat structure until complexity demands folders
- Use functional components with hooks only (no class components)
- Follow React Native naming conventions (PascalCase for components, camelCase for functions/variables)
- No inline styles — use StyleSheet.create()
- Keep App.tsx as the entry point
- Do not add unnecessary dependencies — prefer built-in Expo modules
- Run `npx tsc --noEmit` before considering any change complete
- Do not create README.md unless explicitly asked

## Future Feature Notes
- App will evolve beyond a simple time generator
- Planned features: task notes, notifications, reminders, alarms
- Use `expo-notifications` when adding push/local notifications
- Use `expo-task-manager` for background tasks when needed
