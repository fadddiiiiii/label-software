import React from 'react';
import { X, BookOpen, FileText, Printer, Database } from 'lucide-react';

interface DocumentationDialogProps {
  onClose: () => void;
}

export function DocumentationDialog({ onClose }: DocumentationDialogProps) {
  const [activeTab, setActiveTab] = React.useState<'templates' | 'data' | 'printing'>('templates');

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-[#1e1e2d] w-full max-w-3xl h-[80vh] rounded-2xl shadow-2xl border border-white/10 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-400" />
            Documentation & User Guide
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <div className="w-64 bg-black/20 border-r border-white/5 p-4 space-y-1 overflow-y-auto">
            <button
              onClick={() => setActiveTab('templates')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                activeTab === 'templates' ? 'bg-indigo-500/20 text-indigo-300' : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4" />
              Label Templates
            </button>
            <button
              onClick={() => setActiveTab('data')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                activeTab === 'data' ? 'bg-emerald-500/20 text-emerald-300' : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Database className="w-4 h-4" />
              Data Sources
            </button>
            <button
              onClick={() => setActiveTab('printing')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                activeTab === 'printing' ? 'bg-amber-500/20 text-amber-300' : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Printer className="w-4 h-4" />
              Print Automation
            </button>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto p-8 prose prose-invert prose-indigo max-w-none">
            {activeTab === 'templates' && (
              <div className="space-y-6">
                <h3 className="text-2xl font-semibold text-white">Label Templates</h3>
                <p className="text-white/70">
                  Build dynamic label structures using the drag-and-drop canvas. Templates define
                  the physical dimensions, DPI, and layout grid of your printable medium.
                </p>
                <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                  <h4 className="text-sm font-medium text-white mb-2">Binding Data</h4>
                  <p className="text-sm text-white/50">
                    To connect a text element to an external data source, use curly braces. For example, typing <code className="text-indigo-300 bg-indigo-500/10 px-1 py-0.5 rounded">{'{Product_Name}'}</code> will automatically pull the "Product_Name" column from your CSV during batch printing.
                  </p>
                </div>
              </div>
            )}
            
            {activeTab === 'data' && (
              <div className="space-y-6">
                <h3 className="text-2xl font-semibold text-white">Data Sources</h3>
                <p className="text-white/70">
                  Connect local `.csv`, `.xlsx`, or JSON tables to auto-populate label variables.
                </p>
                <ul className="text-white/60 space-y-2 list-disc pl-5">
                  <li><strong>Importing:</strong> Use the "Data" tab to load external records.</li>
                  <li><strong>Preview:</strong> You can click through data rows to see a live preview of the label rendered exactly as it will print.</li>
                </ul>
              </div>
            )}

            {activeTab === 'printing' && (
              <div className="space-y-6">
                <h3 className="text-2xl font-semibold text-white">Print Automation</h3>
                <p className="text-white/70">
                  OMG utilizes a Universal PDF-to-GDI engine which works securely with all thermal roll printers and standard inkjet hardware.
                </p>
                <div className="bg-amber-500/10 p-4 rounded-lg border border-amber-500/20 mt-4">
                   <h4 className="text-amber-400 font-medium text-sm mb-1">Thermal Delivery</h4>
                   <p className="text-xs text-amber-200/70">
                      When dispatching to thermal hardware (Zebra, Toshiba, TSC), ensure you specify the exact label dimensions in the template settings. The raster engine will automatically convert your design to strict 1-bit monochrome and negotiate the custom layout with the print spooler.
                   </p>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
