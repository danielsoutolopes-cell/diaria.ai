
### 4.3 Adaptação Híbrida de Dispositivo (Mobile Campo vs. Desktop Escritório)
- **Detecção Multimodal (`DeviceContext` / `useDeviceContext`):**
  - Combina `matchMedia('(pointer: coarse)')`, largura de viewport (`< 768px` vs `>= 1024px`) e `matchMedia('(display-mode: standalone)')` para classificar o ambiente em `mobile-field` ou `desktop-office` (sem depender exclusivamente de `navigator.userAgent`).
- **Comportamento Adaptativo:**
  - **Em `mobile-field` (Celular):** Cabeçalho mobile compacto, cards empilhados com alvos de toque `>= 48px`, abertura direta de câmera traseira para fotos de obra/recibos R2 e controles ergonômicos para uso com uma mão.
  - **Em `desktop-office` (Computador):** Sidebar fixa com seletor Multi-Empresa e `Ctrl + K`, tabelas completas com cabeçalho fixo (`sticky`) e `tabular-nums`, e Assistente IA acoplado sem cobrir a área de trabalho.
