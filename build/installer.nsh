; Perguntas extras ao desinstalar. Padrão = NÃO apagar (dados do cliente são sagrados).
; Não pergunta durante atualização (o instalador novo roda o desinstalador por baixo)
; e, em modo silencioso (/S), responde NÃO.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "Apagar também os DADOS do FrioGest (clientes, vendas, estoque, financeiro)?$\r$\n$\r$\nEsta ação não pode ser desfeita.$\r$\n$\r$\nEscolha Não para manter os dados (recomendado se for reinstalar)." /SD IDNO IDNO fg_manter_dados
      RMDir /r "$APPDATA\friogest"
    fg_manter_dados:
    MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "Apagar também a pasta Documentos\FrioGest (backups e PDFs)?$\r$\n$\r$\nSe apagar, não será possível restaurar os dados depois." /SD IDNO IDNO fg_manter_docs
      RMDir /r "$DOCUMENTS\FrioGest"
    fg_manter_docs:
  ${endIf}
!macroend
