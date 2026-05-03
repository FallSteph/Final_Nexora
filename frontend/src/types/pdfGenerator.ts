"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import JsBarcode from "jsbarcode";
import type { Board } from "@/context/AppContext";

// Fix for Next.js/Vite
(jsPDF as any).API.autoTable = autoTable;

export type PdfScope = "allUsers" | "projectOnly" | "all" | "board";

// --- COLORS ---
const COLOR_PRIMARY = [59, 130, 246] as [number, number, number]; // Blue
const COLOR_PURPLE = [109, 40, 217] as [number, number, number];  // Purple
const COLOR_TEXT_BODY = [50, 50, 50] as [number, number, number];
const COLOR_TEXT_LIGHT = [100, 100, 100] as [number, number, number];

// --- HELPERS ---
const getBase64FromUrl = (url: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.setAttribute("crossOrigin", "anonymous");
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(""); 
    img.src = url;
  });
};

const generateBarcodeDataUrl = (text: string): string => {
  const canvas = document.createElement("canvas");
  JsBarcode(canvas, text, {
    format: "CODE128",
    displayValue: false,
    margin: 0,
    height: 40,
    width: 2,
  });
  return canvas.toDataURL("image/png");
};

export const generateAnalyticsPDF = async (
  boards: Board[],
  users: { email: string; role?: string }[],
  scope: PdfScope
) => {
  const logoBase64 = await getBase64FromUrl(`${import.meta.env.BASE_URL}logo.png`);
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const barcodeText = Math.random().toString(36).substring(2, 12).toUpperCase();
  const barcodeImage = generateBarcodeDataUrl(barcodeText);

  // Date String
  const now = new Date();
  const dateStr = `${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')}/${now.getFullYear().toString().slice(-2)} ${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

  // ---------------------------------------------------------
  // COMPACT HEADER
  // ---------------------------------------------------------
  const headerHeight = 26; 
  const addHeader = (doc: jsPDF) => {
    const centerX = pageWidth / 2;

    // 1. Date
    doc.setFontSize(8);
    doc.setTextColor(...COLOR_TEXT_LIGHT);
    doc.text(dateStr, 14, 12); 

    // 2. Logo
    const logoSize = 10;
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, "PNG", centerX - (logoSize / 2), 4, logoSize, logoSize);
      } catch (e) { /* ignore */ }
    }

    // 3. System Name
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLOR_PURPLE);
    doc.text("Nexora", centerX, 19, { align: "center" });

    // 4. Subtitle
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLOR_TEXT_LIGHT);
    doc.text("Project Management System", centerX, 23, { align: "center" });

    // 5. Line
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.1);
    doc.line(14, headerHeight, pageWidth - 14, headerHeight);
  };

  // ---------------------------------------------------------
  // COMPACT FOOTER
  // ---------------------------------------------------------
  const addFooter = (doc: jsPDF, pageNumber: number, totalPages: number) => {
    const footerY = pageHeight - 15;
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.1);
    doc.line(14, footerY, pageWidth - 14, footerY);

    // Barcode
    try {
      doc.addImage(barcodeImage, "PNG", 14, footerY + 2, 30, 8);
      doc.setFontSize(7);
      doc.setTextColor(...COLOR_TEXT_LIGHT);
      doc.text(barcodeText, 14, footerY + 13);
    } catch (e) { /* ignore */ }

    // Page Number
    doc.setFontSize(8);
    doc.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - 14, footerY + 8, { align: "right" });
  };

  // ---------------------------------------------------------
  // CONTENT
  // ---------------------------------------------------------
  
  // Main Title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLOR_PRIMARY);
  doc.text("Analytics Report", pageWidth / 2, 36, { align: "center" });

  let yPosition = 45;

  // 1. PROJECTS OVERVIEW
  if (scope === "projectOnly" || scope === "all") {
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text("Projects Overview", 14, yPosition);
    yPosition += 6;

    const projectsData = boards.map((board) => [
      board.title || "Untitled",
      (board.members?.length || 0).toString(),
      board.description || "-",
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [["Project Title", "Members", "Description"]],
      body: projectsData,
      theme: "grid",
      headStyles: { fillColor: COLOR_PRIMARY, textColor: 255, fontStyle: "bold", fontSize: 9, cellPadding: 2 },
      styles: { fontSize: 8, cellPadding: 2, textColor: COLOR_TEXT_BODY, overflow: 'linebreak' },
      columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold' }, 1: { cellWidth: 20, halign: "center" }, 2: { cellWidth: 'auto' } },
      margin: { top: 35 } 
    });
    yPosition = (doc as any).lastAutoTable.finalY + 10;
  }

  // 2. USERS (PROJECT MANAGERS)
  if (scope === "allUsers" || scope === "all") {
    if (scope === "all") {
      doc.addPage();
      yPosition = 35;
    } 
    else if (yPosition > pageHeight - 40) {
      doc.addPage();
      yPosition = 35;
    }

    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text("All Project Managers", 14, yPosition);
    yPosition += 6;

    const usersMap = new Map();
    boards.forEach(b => b.members?.forEach(m => usersMap.set(m.email, m)));
    users.forEach(u => usersMap.set(u.email, u));
    
    const usersData = Array.from(usersMap.values()).map((u: any) => [
      u.email, 
      u.role ? u.role.charAt(0).toUpperCase() + u.role.slice(1) : "Member"
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [["Email", "Role"]],
      body: usersData.length ? usersData : [["No users found", "-"]],
      theme: "grid",
      headStyles: { fillColor: COLOR_PRIMARY, textColor: 255, fontStyle: "bold", fontSize: 9, cellPadding: 2 },
      styles: { fontSize: 8, cellPadding: 2, textColor: COLOR_TEXT_BODY },
      columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: 'auto' } },
      margin: { top: 35 }
    });
    yPosition = (doc as any).lastAutoTable.finalY + 10;
  }

  // 3. PROJECT DETAILS
  if (scope === "projectOnly" || scope === "all") {
    doc.addPage();
    yPosition = 35; 
    
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text("Project Details", 14, yPosition);
    yPosition += 8;

    boards.forEach((board, index) => {
      if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = 35;
      }

      // Title
      doc.setFontSize(11);
      doc.setTextColor(...COLOR_PRIMARY);
      doc.text(`${index + 1}. ${board.title}`, 14, yPosition);
      yPosition += 5;

      // Description
      doc.setFontSize(9);
      doc.setTextColor(...COLOR_TEXT_LIGHT);
      const splitDesc = doc.splitTextToSize(board.description || "No description provided.", pageWidth - 34);
      doc.text(splitDesc, 14, yPosition);
      yPosition += (splitDesc.length * 4) + 2;

      // Project Manager Info
      const projectManager = board.userEmail || "Unknown";
      doc.setFontSize(9);
      doc.setTextColor(...COLOR_TEXT_BODY);
      doc.text(`Project Manager: ${projectManager}`, 14, yPosition);
      yPosition += 5;

      // Members Table with Card Counts
      const membersData: any[] = [];
      
      // Calculate card counts per member
      const memberCardCounts = new Map<string, number>();
      board.members?.forEach(m => memberCardCounts.set(m.email, 0));
      
      board.lists?.forEach(list => {
        list.cards?.forEach(card => {
          card.assignedMembers?.forEach(memberEmail => {
            const currentCount = memberCardCounts.get(memberEmail) || 0;
            memberCardCounts.set(memberEmail, currentCount + 1);
          });
        });
      });

      // Build table data
      board.members?.forEach(m => {
        membersData.push([
          m.email,
          memberCardCounts.get(m.email)?.toString() || "0"
        ]);
      });

      if (membersData.length > 0) {
        autoTable(doc, {
          startY: yPosition,
          head: [["Team Member Email", "Cards Created"]],
          body: membersData,
          theme: "striped",
          headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold", fontSize: 8, cellPadding: 1.5 },
          styles: { fontSize: 8, cellPadding: 1.5, textColor: COLOR_TEXT_BODY },
          columnStyles: {
            0: { cellWidth: 80 },
            1: { cellWidth: 40 },
            2: { cellWidth: 30, halign: "center" }
          },
          margin: { left: 14, top: 35 },
          tableWidth: pageWidth - 28,
        });
        yPosition = (doc as any).lastAutoTable.finalY + 8;
      } else {
        doc.setFontSize(8);
        doc.text("(No members assigned)", 14, yPosition);
        yPosition += 8;
      }
    });
  }

  // --- APPLY HEADER/FOOTER ---
  const totalPages = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addHeader(doc);
    addFooter(doc, i, totalPages);
  }

  doc.save(`analytics-report-${new Date().toISOString().split("T")[0]}.pdf`);
};
