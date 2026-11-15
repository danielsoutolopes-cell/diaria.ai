# 📋 Proposta Operacional de Validação & Confirmação de Diárias
**Projeto: Ponto Patrícia (Diária.AI)**  
*Documento para alinhamento e validação com a Administradora Central: **Patrícia Grubel***

---

## 🎯 1. Visão Geral para a Patrícia
Patrícia, o objetivo do sistema não é mudar o jeito que os encarregados falam no WhatsApp, mas sim **tirar de você o estresse de somar anotações à mão, conferir papel molhado e recalcular diárias quebradas**.

- **Fechamento Quinzenal organizado toda sexta-feira**: Embora o pagamento seja a cada 15 dias, o sistema faz o fechamento prévio toda sexta. Quando chega a semana de pagar, a conta já está 100% pronta, sem correria de última hora.
- **Human-in-the-Loop**: A inteligência artificial **nunca toma decisões financeiras nem efetua pagamentos sozinha**. Ela apenas lê a mensagem, faz as contas preliminares e coloca tudo organizado na sua tela para você aprovar em 1 clique.

---

## 💬 2. Como a IA Lê as Mensagens de Campo (Seus Exemplos Reais)

---

### Caso 1: Viagem para Obra Fora (Bahia)
> **Mensagem recebida no WhatsApp:**  
> *"Viagem Bahia 05/11 quinta feira*  
> *Peu*  
> *Ian*  
> *Zé baiano*  
> *Daniel"*

* **Como o sistema processa:**
  * **Data**: `05/11` (quinta-feira) | **Obra**: Bahia.
  * **Regra de Viagem**: R$ 120,00 para os passageiros.
  * **Pergunta na Tela**: Um seletor rápido pergunta: *"Quem foi o motorista?"*.
  * Se você marcar que o **Daniel** dirigiu, ele recebe a diária integral dele (R$ 150/180) e os passageiros (Peu, Ian, Zé baiano) recebem R$ 120,00.
  * Você dá 1 clique em **"Aprovar"** e a folha quinzenal é alimentada.

---

### Caso 2: Meio Período (Piscina Porto Seguro)
> **Mensagem recebida no WhatsApp:**  
> *"Segunda dia 09 de novembro piscina porto seguro. Meio dia .*  
> *Gil*  
> *Mateus*  
> *Lucas.j.*  
> *Peu*  
> *Ian*  
> *José baiano*  
> *Daniel"*

* **Como o sistema processa:**
  * **Data**: `09/11` (segunda-feira) | **Obra**: Bahia (Canteiro Porto Seguro).
  * **Regra**: Meio Período (**0.5x**) para todos da lista.
  * **Valores**: Entra automaticamente 0.5x da diária de piscina (R$ 75,00 para cada um dos 7 operários).
  * Se por acaso um deles tiver ficado o dia inteiro, você apenas toca no botão "1.0 Integral" daquele trabalhador e aprova.

---

### Caso 3: Dia de Chuva (Piscina Impossibilitada)
> **Mensagem recebida no WhatsApp:**  
> *"Sábado dia 14 de novembro. Piscina porto seguro. Diárias de chuva.*  
> *Gil*  
> *Mateus*  
> *Lucas. J.*  
> *Peu*  
> *Ian*  
> *José baiano*  
> *Daniel"*

* **Como o sistema processa:**
  * **Data**: `14/11` (sábado) | **Obra**: Bahia (Porto Seguro).
  * **Regra**: Diária de Chuva padronizada em **R$ 120,00** para todos.
  * O motivo fica registrado como `DIÁRIA DE CHUVA` para resguardo e conferência contábil.
  * Você bate o olho nos totais e confirma.

---

### Caso 4: Apelidos e Canteiro Próprio ("Quase Tudo")
> **Mensagem recebida no WhatsApp:**  
> *"Quase tudo 13/11*  
> *Wender 22*  
> *Mauro obra*  
> *Manoel"*

* **Como o sistema processa:**
  * **Obra**: Canteiro *"Quase Tudo"*.
  * **Data**: `13/11`.
  * **Colaboradores**: Reconhece apelidos como *Wender 22*, *Mauro obra* e *Manoel*.
  * Lança diária integral (1.0) para os três, de acordo com o padrão cadastrado para essa obra.

---

## 🛡️ 3. O Fluxo de Segurança e Controle da Patrícia

1. **Avisos Espelhados**: Patrícia e Daniel recebem os avisos de novos apontamentos no WhatsApp.
2. **Trava de Confirmação Prévia ("Já Confirmado")**: Se o Daniel tentar mexer em algo que a Patrícia já validou, o sistema trava e pergunta se ele quer mesmo alterar.
3. **Alerta Obrigatório no Celular da Patrícia**: Se qualquer pessoa alterar um apontamento já feito, o celular da Patrícia recebe na hora uma mensagem avisando quem alterou, qual trabalhador, a obra e a diferença de valor.
4. **Vales Opcionais**: Nenhum vale de canteiro é descontado sem o seu aval. Se desmarcar o vale no borderô, o trabalhador recebe o valor cheio e o vale continua guardado no sistema como saldo a dever para a próxima quinzena.

---

## 📝 4. Perguntas para Alinhamento com a Patrícia
1. **Os valores base das diárias estão certos para o seu padrão?**
   * Diária padrão de Piscina: R$ 150,00
   * Diária padrão de Obra Civil: R$ 180,00
   * Dia de Chuva: R$ 120,00
   * Dia Parado (sem acesso / condomínio travou): R$ 120,00
   * Dia de Viagem: R$ 120,00 para equipe e diária cheia para quem dirige (motorista).
2. **A seleção rápida de quem dirigiu na tela de viagem facilita a sua conferência?**
3. **O formato de fechamento toda sexta-feira para pagamento quinzenal atende bem à sua rotina?**
