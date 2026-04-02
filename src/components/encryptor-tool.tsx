
"use client";

import { useState, useRef, type ChangeEvent, type DragEvent, memo, useCallback, useEffect } from "react";
import QRCode, { QRCodeCanvas } from "qrcode.react";
import {
  KeyRound,
  Lock,
  Unlock,
  Loader2,
  FileText,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  X,
  Heart,
  Info,
  Download,
  QrCode,
  Shield,
  Globe,
  UserX,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { encryptFile, decryptFile } from "@/lib/crypto";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


type Mode = "encrypt" | "decrypt";
type InputType = "file" | "text";

// Chunked base64 encode/decode to avoid stack overflow on large buffers.
// The spread operator in btoa(String.fromCharCode(...arr)) exceeds the
// maximum call stack size for buffers larger than ~65KB.
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x8000; // 32KB — well under any engine's argument limit
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const validateAndSanitizeFile = (file: File) => {
  if (file.name.includes('..') || 
      file.name.includes('/') || 
      file.name.includes('\\') ||
      file.name.length > 255) {
    throw new Error('Invalid filename. It may contain invalid characters or be too long.');
  }
  
  if (file.name.includes('\0')) {
    throw new Error('Invalid filename. It contains null bytes.');
  }
  
  return true;
};

interface FileSelectorProps {
  id: string;
  onFileChange: (event: ChangeEvent<HTMLInputElement> | DragEvent<HTMLDivElement>) => void;
  onClear: () => void;
  selectedFile: File | null;
  icon: React.ReactNode;
  label: string;
  description: string;
}

const FileSelector = memo(({
  id,
  onFileChange,
  onClear,
  selectedFile,
  icon,
  label,
  description,
}: FileSelectorProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleContainerClick = useCallback(() => {
    inputRef.current?.click();
  }, []);
  
  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileChange(e);
    }
  }, [onFileChange]);


  return (
    <div>
      <div
        className={cn("relative flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center transition-colors duration-200 hover:border-primary/50", { 'border-primary/50 bg-primary/10': isDragging })}
        onClick={handleContainerClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && handleContainerClick()}
      >
        <div className="mb-2 text-primary">{icon}</div>
        <div className="w-full overflow-hidden">
          <h3 className="text-md font-semibold text-foreground">{label}</h3>
          <p className={cn("mt-1 w-full overflow-hidden truncate text-sm", selectedFile ? "text-accent font-semibold" : "text-muted-foreground")}>
            {selectedFile ? selectedFile.name : description}
          </p>
        </div>
      </div>
       {selectedFile && (
        <div className="text-right">
          <Button variant="link" size="sm" onClick={onClear} className="text-destructive hover:text-destructive/80">
            Clear
          </Button>
        </div>
      )}
      <Input
        id={id}
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={onFileChange}
      />
    </div>
  );
});
FileSelector.displayName = "FileSelector";

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
const QR_MAX_CHARS = 2_953; // QR version 40, error correction M, byte mode

export function EncryptorTool() {
  const [mode, setMode] = useState<Mode>("encrypt");
  const [inputType, setInputType] = useState<InputType>('file');
  const [file, setFile] = useState<File | null>(null);
  const [textSecret, setTextSecret] = useState('');
  const [outputText, setOutputText] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showDecryptedText, setShowDecryptedText] = useState(false);
  const [useKeyFile, setUseKeyFile] = useState(false);
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [passwordIsStrong, setPasswordIsStrong] = useState(false);
  const [isCryptoAvailable, setIsCryptoAvailable] = useState(true);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isDecryptQrModalOpen, setIsDecryptQrModalOpen] = useState(false);
  const [selectedDecryptText, setSelectedDecryptText] = useState('');
  const qrCodeRef = useRef<HTMLDivElement>(null);
  const clipboardTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  // Clean up clipboard auto-clear timer on unmount
  useEffect(() => {
    return () => {
      if (clipboardTimeoutRef.current) {
        clearTimeout(clipboardTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!window.crypto || !window.crypto.subtle || !window.crypto.getRandomValues) {
      setIsCryptoAvailable(false);
      toast({
        title: "Security Warning",
        description: "Web Crypto API is not available in this browser. This application cannot run securely.",
        variant: "destructive",
        duration: Infinity, // Keep it visible
      });
    }
  }, [toast]);

  const checkIsPasswordStrong = useCallback((pwd: string) => {
    const hasUpperCase = /[A-Z]/.test(pwd);
    const hasLowerCase = /[a-z]/.test(pwd);
    const hasNumbers = /\d/.test(pwd);
    const hasSpecialChars = /[!@#$%^&*(),.?":{}|<>]/.test(pwd);
    const hasMinLength = pwd.length >= 24;
    return hasMinLength && hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChars;
  }, []);

  const handlePasswordChange = useCallback((pwd: string) => {
    setPassword(pwd);
    setPasswordIsStrong(checkIsPasswordStrong(pwd));
  }, [checkIsPasswordStrong]);

  const resetState = useCallback(() => {
    setFile(null);
    setPassword('');
    setPasswordIsStrong(false);
    setShowPassword(false);
    setUseKeyFile(false);
    setKeyFile(null);
    setTextSecret('');
    setOutputText('');
    setShowDecryptedText(false);
    setInputType('file');
  }, []);

  const handleModeChange = useCallback((newMode: string) => {
    setMode(newMode as Mode);
    resetState();
  }, [resetState]);
  
  const handleInputTypeChange = useCallback((newType: string) => {
      setInputType(newType as InputType);
  }, []);

  const handleFileChange = useCallback((
    e: ChangeEvent<HTMLInputElement> | DragEvent<HTMLDivElement>,
    setter: (file: File | null) => void
  ) => {
    let selectedFile: File | null = null;
    if ('dataTransfer' in e) { // DragEvent
      selectedFile = e.dataTransfer.files?.[0] || null;
    } else { // ChangeEvent
      selectedFile = e.target.files?.[0] || null;
      if (e.target) {
        e.target.value = "";
      }
    }

    if (!selectedFile) {
        setter(null);
        return;
    }

    try {
      validateAndSanitizeFile(selectedFile);
    } catch (error: any) {
        toast({
            title: "Invalid File",
            description: error.message,
            variant: "destructive",
        });
        setter(null);
        return;
    }
    
    if (selectedFile.size > MAX_FILE_SIZE) {
      toast({
        title: "File Too Large",
        description: `Please select a file smaller than ${MAX_FILE_SIZE / 1024 / 1024}MB.`,
        variant: "destructive",
      });
      setter(null);
      return;
    }

    setter(selectedFile);
  }, [toast]);
  

  const generatePassword = useCallback(() => {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=";
    const passwordLength = 32;
    const charsetLength = charset.length;
    // Rejection sampling: discard values that would cause modulo bias.
    // limit is the largest multiple of charsetLength that fits in a Uint32.
    const limit = Math.floor(0x100000000 / charsetLength) * charsetLength;
    let newPassword = "";
    while (newPassword.length < passwordLength) {
      const array = new Uint32Array(passwordLength - newPassword.length);
      window.crypto.getRandomValues(array);
      for (let i = 0; i < array.length && newPassword.length < passwordLength; i++) {
        if (array[i]! < limit) {
          newPassword += charset.charAt(array[i]! % charsetLength);
        }
      }
    }
    handlePasswordChange(newPassword);
    toast({ title: "Password Generated", description: "A new secure password has been generated." });
  }, [toast, handlePasswordChange]);


  const handleCopy = useCallback((textToCopy: string) => {
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy).then(() => {
      toast({ title: "Copied to clipboard", description: "Auto-clear will be attempted in 60 seconds (may not work if tab loses focus)." });

      // Reset any existing auto-clear timer
      if (clipboardTimeoutRef.current) {
        clearTimeout(clipboardTimeoutRef.current);
      }

      // Auto-clear clipboard after 60 seconds (best-effort)
      clipboardTimeoutRef.current = setTimeout(async () => {
        try {
          const current = await navigator.clipboard.readText();
          if (current === textToCopy) {
            await navigator.clipboard.writeText('');
          }
        } catch {
          // Clipboard read may fail if tab is not focused — silently ignore
        }
        clipboardTimeoutRef.current = null;
      }, 60_000);
    }).catch(() => {
       toast({ title: "Failed to copy", variant: "destructive" });
    });
  }, [toast]);

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  const generateKeyFile = useCallback(() => {
    const keyData = new Uint8Array(64);
    window.crypto.getRandomValues(keyData);
    const blob = new Blob([keyData], { type: 'application/octet-stream' });
    triggerDownload(blob, 'ittybitz-key.bin');
    toast({ title: "Key File Generated", description: "Your new key file has been downloaded." });
  }, [toast]);

  // High-res QR download: renders at 900px (≈3" at 300 DPI) with quiet zone padding
  const hiResQrRef = useRef<HTMLDivElement>(null);
  const hiResDecryptQrRef = useRef<HTMLDivElement>(null);

  const handleDownloadQrCode = useCallback(() => {
    if (!hiResQrRef.current) return;
    const hiResCanvas = hiResQrRef.current.querySelector('canvas');
    if (!hiResCanvas) return;

    // Add a quiet zone (padding) around the QR — 4 modules is standard,
    // but we use a generous fixed margin for clean printing
    const PADDING = 60; // ~60px at 900px ≈ a comfortable quiet zone
    const exportCanvas = document.createElement('canvas');
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    exportCanvas.width = hiResCanvas.width + PADDING * 2;
    exportCanvas.height = hiResCanvas.height + PADDING * 2;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    ctx.drawImage(hiResCanvas, PADDING, PADDING);

    const pngUrl = exportCanvas
      .toDataURL("image/png")
      .replace("image/png", "image/octet-stream");

    const a = document.createElement("a");
    a.href = pngUrl;
    a.download = "encrypted-qr.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    toast({ title: "QR Code downloaded", description: "High-resolution (300 DPI / 1020×1020px)" });
  }, [toast]);

  const handleDownloadDecryptQrCode = useCallback(() => {
    if (!hiResDecryptQrRef.current) return;
    const hiResCanvas = hiResDecryptQrRef.current.querySelector('canvas');
    if (!hiResCanvas) return;
    const PADDING = 60;
    const exportCanvas = document.createElement('canvas');
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;
    exportCanvas.width = hiResCanvas.width + PADDING * 2;
    exportCanvas.height = hiResCanvas.height + PADDING * 2;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    ctx.drawImage(hiResCanvas, PADDING, PADDING);
    const pngUrl = exportCanvas.toDataURL("image/png").replace("image/png", "image/octet-stream");
    const a = document.createElement("a");
    a.href = pngUrl;
    a.download = "decrypted-qr.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast({ title: "QR Code downloaded", description: "High-resolution (300 DPI / 1020×1020px)" });
  }, [toast]);

  const processData = useCallback(async () => {
    let mutablePassword = password;

    const hasInput = inputType === 'file' ? !!file : !!textSecret;
    if (!hasInput) {
      toast({
        title: `Missing ${inputType === 'file' ? 'File' : 'Text'}`,
        description: `Please provide a ${inputType} to process.`,
        variant: "destructive",
      });
      return;
    }
    if (!mutablePassword) {
        toast({
          title: "Password Required",
          description: "Please provide a password.",
          variant: "destructive",
        });
        return;
    }
    
    if (mode === "encrypt" && !checkIsPasswordStrong(mutablePassword)) {
        toast({
          title: "Weak Password",
          description: "Please use a password that is at least 24 characters and includes uppercase, lowercase, numbers, and symbols.",
          variant: "destructive",
        });
        return;
    }

    setIsLoading(true);
    setOutputText('');
    setShowDecryptedText(false);

    try {
      const keyFileBuffer = keyFile ? await keyFile.arrayBuffer() : null;
      
      let resultBuffer: ArrayBuffer;
      
      if (mode === 'encrypt') {
        const encoder = new TextEncoder();
        const inputBuffer = inputType === 'file' ? await file!.arrayBuffer() : (encoder.encode(textSecret).buffer as ArrayBuffer);
        resultBuffer = await encryptFile(inputBuffer, mutablePassword, keyFileBuffer);

        if (inputType === 'file') {
            const blob = new Blob([resultBuffer]);
            triggerDownload(blob, `${file!.name}.ibitz`);
            setFile(null);
        } else {
            const base64String = uint8ArrayToBase64(new Uint8Array(resultBuffer));
            setOutputText(base64String);
            setTextSecret('');
        }

      } else { // Decrypt
        let inputBuffer: ArrayBuffer;
        if (inputType === 'file') {
            inputBuffer = await file!.arrayBuffer();
        } else {
            const bytes = base64ToUint8Array(textSecret);
            inputBuffer = bytes.buffer as ArrayBuffer;
        }

        resultBuffer = await decryptFile(inputBuffer, mutablePassword, keyFileBuffer);
        
        if (inputType === 'file') {
             const resultFilename = file!.name.endsWith('.ibitz')
              ? file!.name.slice(0, -'.ibitz'.length)
              : `decrypted-${file!.name}`;
            const blob = new Blob([resultBuffer]);
            triggerDownload(blob, resultFilename);
        } else {
            const decoder = new TextDecoder();
            setOutputText(decoder.decode(resultBuffer));
        }
      }

      toast({
        title: "Success!",
        description: `Your ${inputType} has been successfully ${mode === 'encrypt' ? 'encrypted' : 'decrypted'}.`,
      });
    } catch (error: any) {
        const knownSafeMessages = [
          'Invalid encrypted data format.',
          'Cannot process empty data.',
          'Password must be a string.',
          'Password is too long.',
          'Password contains invalid characters.',
          'A password is required for encryption.',
          'A password or key file is required for decryption.',
          'Web Crypto API not available.',
          'This file was encrypted with a newer version of IttyBitz. Please update the app.',
        ];
        const raw = error.message || '';
        const safeMessage = knownSafeMessages.includes(raw)
          ? raw
          : mode === 'decrypt'
            ? 'Decryption failed. The password or key file may be incorrect, or the data may be corrupted.'
            : 'Processing failed. Please try again.';

        toast({
            title: "Processing Error",
            description: safeMessage,
            variant: "destructive",
        });
    } finally {
      // Clear sensitive data
      mutablePassword = ''; 
      setPassword('');
      setPasswordIsStrong(false);
      setIsLoading(false);
    }
  }, [file, mode, keyFile, toast, inputType, textSecret, checkIsPasswordStrong, password]);
  
  const handleUseKeyFileChange = useCallback((checked: boolean) => {
      setUseKeyFile(checked);
      if (!checked) {
          setKeyFile(null);
      }
  }, []);

  const getPasswordStrengthColor = useCallback(() => {
    if (!password) return "border-input";
    if (checkIsPasswordStrong(password)) return "border-success";
    return "border-destructive";
  }, [checkIsPasswordStrong, password]);

  const isProcessButtonDisabled = () => {
    if (isLoading || !isCryptoAvailable) return true;
    const hasInput = inputType === 'file' ? !!file : !!textSecret;
    const hasPassword = !!password;
    if (!hasInput || !hasPassword) return true;
    
    if (mode === 'encrypt' && !passwordIsStrong) {
        return true;
    }
    
    return false;
  }

  const renderContent = (currentMode: Mode) => (
    <div className="space-y-6">
      <div className="space-y-4">
        <RadioGroup value={inputType} onValueChange={handleInputTypeChange} className="flex justify-center space-x-4">
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="file" id="file-option" />
            <Label htmlFor="file-option" className="cursor-pointer">File</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="text" id="text-option" />
            <Label htmlFor="text-option" className="cursor-pointer">Text</Label>
          </div>
        </RadioGroup>

        {inputType === 'file' ? (
           <FileSelector
            id={`${currentMode}-file`}
            onFileChange={(e) => handleFileChange(e, setFile)}
            onClear={() => setFile(null)}
            selectedFile={file}
            icon={<FileText size={32} />}
            label="Select File (100MB Max)"
            description={`Drag & drop or click to select file to ${currentMode}`}
          />
        ) : (
          <div className="space-y-2">
            <Label htmlFor="text-secret">Secret Text</Label>
            <Textarea
              id="text-secret"
              value={textSecret}
              onChange={(e) => setTextSecret(e.target.value)}
              placeholder={`Enter text to ${currentMode}...`}
              rows={5}
            />
          </div>
        )}
        
        <TooltipProvider>
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Label htmlFor="password">Password</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="focus:outline-none">
                      <Info className="h-4 w-4 text-orange-500" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Min 24 chars, 1 uppercase, 1 lowercase, 1 number, 1 symbol.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
            <div className="relative mt-1">
                <Input
                    id="password"
                    value={password}
                    type={showPassword ? "text" : "password"}
                    onChange={(e) => handlePasswordChange(e.target.value)}
                    placeholder="Enter password..."
                    className={cn(
                      "pr-10 transition-colors duration-300",
                      getPasswordStrengthColor()
                    )}
                />
                <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff /> : <Eye />}
                </Button>
            </div>
            <div className="flex flex-wrap justify-center gap-2 mt-2">
                <Button variant="outline" size="sm" onClick={() => handleCopy(password)} disabled={!password}><Copy className="mr-1 h-3 w-3" />Copy</Button>
                <Button variant="outline" size="sm" onClick={() => handlePasswordChange("")} disabled={!password}><X className="mr-1 h-3 w-3" />Clear</Button>
                {currentMode === 'encrypt' && <Button variant="outline" size="sm" onClick={generatePassword}><RefreshCw className="mr-1 h-3 w-3" />Generate</Button>}
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Switch id="use-keyfile" checked={useKeyFile} onCheckedChange={handleUseKeyFileChange} />
             <div className="flex items-center gap-1">
                <Label htmlFor="use-keyfile">Use Key File (Optional)</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="focus:outline-none">
                      <Info className="h-4 w-4 text-orange-500" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>For additional security, you can use a key file. Use the generator to create a new, highly secure key file (recommended), or select an existing file. This file will be required along with your password to decrypt data.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
          </div>
        
          {useKeyFile && (
            <div className="animate-in fade-in-50 space-y-2">
              <FileSelector
                id={`${currentMode}-keyfile`}
                onFileChange={(e) => handleFileChange(e, setKeyFile)}
                onClear={() => setKeyFile(null)}
                selectedFile={keyFile}
                icon={<KeyRound size={32} />}
                label="Select Key File"
                description="Drag & drop or click to select an existing file"
              />
              <div className="flex items-center gap-2">
                <hr className="flex-grow border-t border-muted-foreground/20" />
                <span className="text-xs text-muted-foreground">OR</span>
                <hr className="flex-grow border-t border-muted-foreground/20" />
              </div>
              <Button variant="outline" className="w-full" onClick={generateKeyFile}>
                <Download className="mr-2 h-4 w-4" />
                Generate & Download New Key File
              </Button>
            </div>
          )}
        </TooltipProvider>
      </div>

       {outputText && (
          <div className="space-y-2 animate-in fade-in-50">
            <Label htmlFor="output-text">Result</Label>
            <div className="relative">
              <Textarea
                id="output-text"
                value={outputText}
                readOnly
                rows={5}
                className={cn(
                  "pr-12",
                  mode === 'decrypt' && inputType === 'text' && !showDecryptedText && "blur-sm"
                )}
                onMouseUp={() => { const ta = document.getElementById('output-text') as HTMLTextAreaElement; if (ta) { const sel = ta.value.substring(ta.selectionStart, ta.selectionEnd); setSelectedDecryptText(sel || outputText); } }}
                onKeyUp={() => { const ta = document.getElementById('output-text') as HTMLTextAreaElement; if (ta) { const sel = ta.value.substring(ta.selectionStart, ta.selectionEnd); setSelectedDecryptText(sel || outputText); } }}
              />
              <div className="absolute right-1 top-1 flex flex-col items-center">
                 {mode === 'decrypt' && inputType === 'text' && (
                  <Button type="button" variant="ghost" size="icon" className="h-auto p-2" onClick={() => setShowDecryptedText(!showDecryptedText)}>
                    {showDecryptedText ? <EyeOff /> : <Eye />}
                  </Button>
                )}
                <Button type="button" variant="ghost" size="icon" className="h-auto p-2" onClick={() => handleCopy(outputText)}>
                    <Copy />
                </Button>
                 {mode === 'encrypt' && inputType === 'text' && (
                    <Dialog open={isQrModalOpen} onOpenChange={setIsQrModalOpen}>
                      <DialogTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="h-auto p-2">
                            <QrCode />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Encrypted QR Code</DialogTitle>
                          <DialogDescription>
                            Scan this code to transfer the encrypted text.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="flex flex-col items-center gap-4 py-4" ref={qrCodeRef}>
                           {outputText.length <= QR_MAX_CHARS ? (
                             <>
                               {/* Preview QR (256px for the dialog) */}
                               <QRCode value={outputText} size={256} />
                               {/* Hidden high-res QR (900px ≈ 3" at 300 DPI) for download */}
                               <div ref={hiResQrRef} style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
                                 <QRCodeCanvas value={outputText} size={900} />
                               </div>
                               <Button onClick={handleDownloadQrCode}>
                                <Download className="mr-2 h-4 w-4" />
                                Download PNG (300 DPI)
                               </Button>
                             </>
                           ) : (
                             <div className="text-sm text-yellow-400 p-3 bg-yellow-900/20 rounded-md text-center">
                               <p className="font-medium">QR code unavailable</p>
                               <p className="mt-1">Output is {outputText.length.toLocaleString()} characters, which exceeds the QR code capacity of {QR_MAX_CHARS.toLocaleString()} characters. Use the copy button instead.</p>
                             </div>
                           )}
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                {mode === 'decrypt' && inputType === 'text' && showDecryptedText && (
                  <Dialog open={isDecryptQrModalOpen} onOpenChange={setIsDecryptQrModalOpen}>
                    <DialogTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="h-auto p-2">
                        <QrCode />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Plaintext QR Code</DialogTitle>
                        <DialogDescription>
                          Scan this code to transfer the decrypted text to your hardware wallet.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="flex flex-col items-center gap-4 py-4">
                        {selectedDecryptText.length <= QR_MAX_CHARS ? (
                          <>
                            <p style={{wordBreak: 'break-all', fontSize: '12px', color: 'gray'}}>{selectedDecryptText}</p>
                            <QRCode value={selectedDecryptText} size={256} />
                            <div ref={hiResDecryptQrRef} style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
                              <QRCodeCanvas value={selectedDecryptText} size={900} />
                            </div>
                            <Button onClick={handleDownloadDecryptQrCode}>
                              <Download className="mr-2 h-4 w-4" />
                              Download PNG (300 DPI)
                            </Button>
                          </>
                        ) : (
                          <div className="text-sm text-yellow-400 p-3 bg-yellow-900/20 rounded-md text-center">
                            <p className="font-medium">QR code unavailable</p>
                            <p className="mt-1">Output is {selectedDecryptText.length.toLocaleString()} characters, which exceeds the QR code capacity of {QR_MAX_CHARS.toLocaleString()} characters. Use the copy button instead.</p>
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>
          </div>
        )}

      <Button
        onClick={processData}
        disabled={isProcessButtonDisabled()}
        className="w-full text-lg font-bold py-6 bg-gradient-to-br from-yellow-400 via-orange-500 to-red-600 text-primary-foreground hover:opacity-90 transition-all duration-300 transform hover:scale-105"
      >
        {isLoading ? (
          <Loader2 className="mr-2 h-6 w-6 animate-spin" />
        ) : (
          currentMode === 'encrypt' ? <Lock className="mr-2 h-6 w-6" /> : <Unlock className="mr-2 h-6 w-6" />
        )}
        {currentMode === 'encrypt' ? `Encrypt ${inputType === 'file' ? 'File' : 'Text'}` : `Decrypt ${inputType === 'file' ? 'File' : 'Text'}`}
      </Button>
    </div>
  );

  const tabTriggerClasses = "font-semibold data-[state=active]:bg-gradient-to-br data-[state=active]:from-yellow-400 data-[state=active]:via-orange-500 data-[state=active]:to-red-600 data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg";

  return (
    <Tabs value={mode} onValueChange={handleModeChange} className="flex flex-col min-h-screen">
      {/* ---- HEADER ---- */}
      <header className="sticky top-0 z-50 w-full border-b border-zinc-700 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <img src="/logo.webp" alt="IttyBitz Logo" width={28} height={28} />
            <span className="text-lg font-bold">IttyBitz</span>
          </div>
          <TabsList className="hidden sm:inline-flex bg-zinc-800 p-1">
            <TabsTrigger value="encrypt" className={tabTriggerClasses}>
              <Lock className="mr-2 h-4 w-4" />
              Encrypt
            </TabsTrigger>
            <TabsTrigger value="decrypt" className={tabTriggerClasses}>
              <Unlock className="mr-2 h-4 w-4" />
              Decrypt
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="sm:hidden border-t border-zinc-800 px-4 pb-2 pt-1">
          <TabsList className="grid w-full grid-cols-2 bg-zinc-800 p-1">
            <TabsTrigger value="encrypt" className={tabTriggerClasses}>
              <Lock className="mr-2 h-4 w-4" />
              Encrypt
            </TabsTrigger>
            <TabsTrigger value="decrypt" className={tabTriggerClasses}>
              <Unlock className="mr-2 h-4 w-4" />
              Decrypt
            </TabsTrigger>
          </TabsList>
        </div>
      </header>

      {/* ---- MAIN CONTENT ---- */}
      <div className="flex-1 w-full">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-8">
          {/* Desktop-only large logo + name */}
          <div className="hidden sm:flex items-center justify-center gap-3 mb-6">
            <img src="/logo.webp" alt="IttyBitz Logo" width={48} height={48} />
            <span className="text-4xl font-bold text-white">IttyBitz</span>
          </div>
          <div className="mb-6 text-center">
            <p className="text-lg font-semibold text-white">Secure by design. Simple by nature.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Secure, <a href="https://github.com/seQRets/ittybitz" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">open-source</a>, client-side encryption and decryption.
            </p>
          </div>
          <TabsContent value="encrypt">
            {renderContent("encrypt")}
          </TabsContent>
          <TabsContent value="decrypt">
            {renderContent("decrypt")}
          </TabsContent>
          {/* Desktop-only feature highlights */}
          <div className="hidden sm:grid grid-cols-3 gap-4 mt-8 text-left">
            <div className="flex items-start gap-2">
              <Shield className="h-4 w-4 mt-0.5 text-accent shrink-0" />
              <div>
                <p className="text-sm font-medium text-white">AES-256-GCM</p>
                <p className="text-xs text-muted-foreground">Military-grade encryption with 1M iteration key derivation.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Globe className="h-4 w-4 mt-0.5 text-accent shrink-0" />
              <div>
                <p className="text-sm font-medium text-white">100% Client-Side</p>
                <p className="text-xs text-muted-foreground">Nothing leaves your browser. No servers, no uploads, no tracking.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <UserX className="h-4 w-4 mt-0.5 text-accent shrink-0" />
              <div>
                <p className="text-sm font-medium text-white">No Accounts</p>
                <p className="text-xs text-muted-foreground">No sign-ups or logins. Just encrypt and go.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---- FOOTER ---- */}
      <footer className="w-full border-t border-zinc-700 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 py-4 sm:flex-row sm:justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Heart className="h-3 w-3 text-red-500" />
            <span>Enjoying IttyBitz?</span>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="link" className="text-accent p-0 h-auto text-xs">Support this project</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Support IttyBitz</DialogTitle>
                  <DialogDescription>
                    If you find this tool useful, please consider supporting its development. Your donation helps keep the project alive and ad-free.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col items-center gap-4 py-4">
                  <QRCode value="https://coinos.io/svrn_money" size={128} />
                  <a href="https://coinos.io/svrn_money" target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:underline break-all">
                    https://coinos.io/svrn_money
                  </a>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="flex items-center gap-3">
            <a href="https://github.com/seQRets/ittybitz" target="_blank" rel="noopener noreferrer" className="hover:underline">GitHub</a>
            <span>v 2.0.0 🔑 Lockdown</span>
          </div>
        </div>
      </footer>
    </Tabs>
  );
}

    