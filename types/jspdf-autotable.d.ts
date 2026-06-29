import "jspdf"

declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: Record<string, unknown>) => jsPDF
  }

  namespace jsPDF {
    interface jsPDFInternal {
      getNumberOfPages: () => number
    }
  }
}

declare module "jspdf-autotable"
