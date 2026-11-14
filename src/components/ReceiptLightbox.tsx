'use client';

import React, { useState } from 'react';
import { Paperclip, Download, X, Eye, Loader2, Image as ImageIcon } from 'lucide-react';

interface ReceiptLightboxProps {
  comprovanteUrl: string | null | undefined;
  nomeFuncionario: string;
  dataReferencia: string;
}

export function ReceiptLightbox({ comprovanteUrl, nomeFuncionario, dataReferencia }: ReceiptLightboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  if (!comprovanteUrl) {
    return <span className="text-slate-300 font-medium">-</span>;
  }

  async function handleDownload(e: React.MouseEvent) {
    e.stopPropagation();
    if (!comprovanteUrl) return;

    setDownloading(true);
    try {
      const response = await fetch(comprovanteUrl);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = blobUrl;
      const cleanName = (nomeFuncionario || 'funcionario')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '-');
      const cleanData = (dataReferencia || 'data').replace(/[^a-zA-Z0-9]/g, '-');
      link.download = `recibo-${cleanName}-${cleanData}.jpg`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Erro ao baixar comprovante:', err);
      // Fallback: abrir em nova aba
      window.open(comprovanteUrl, '_blank');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      {/* Botão Ghost discreto e elegante */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(true);
        }}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200/80 text-xs font-semibold transition-all shadow-sm active:scale-95"
        title="Ver recibo / comprovante"
      >
        <Paperclip className="w-3.5 h-3.5" />
        <span>Recibo</span>
      </button>

      {/* Modal Lightbox */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fade-in"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-100 relative space-y-4 animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 px-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">Comprovante de Vale / Recibo</h4>
                  <p className="text-[11px] text-slate-500">
                    {nomeFuncionario} • {dataReferencia}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Imagem Ampliada */}
            <div className="px-6 py-2 flex items-center justify-center bg-slate-950/5 rounded-2xl mx-6 border border-slate-200/60 max-h-[60vh] overflow-hidden">
              <img
                src={comprovanteUrl}
                alt={`Comprovante de ${nomeFuncionario}`}
                className="max-h-[55vh] w-auto object-contain rounded-xl shadow-md"
              />
            </div>

            {/* Rodapé com Download */}
            <div className="p-4 px-6 border-t border-slate-100 flex items-center justify-between bg-slate-50">
              <span className="text-[11px] text-slate-400 font-mono truncate max-w-[200px]">
                Cloudflare R2 Storage
              </span>

              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-700/20 flex items-center gap-2 active:scale-95 disabled:opacity-50"
              >
                {downloading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>Baixar Comprovante</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

