"use client";

import React, { useState, useEffect } from "react";
import { Plus, Trash2, FileText, Globe, Search, Loader2, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { showSuccessToast } from "@/utils/toast";

interface KnowledgeSource {
  id: string;
  type: "file" | "link";
  name: string;
  content: string; // URL for link, name for file
  date: string;
  status: "synced" | "processing" | "error";
}

const KnowledgeBasePage = () => {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Form states
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    setIsMounted(true);
    const saved = localStorage.getItem("upgrade_knowledge_base");
    if (saved) {
      try {
        setSources(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse knowledge base from localStorage", e);
      }
    }
  }, []);

  useEffect(() => {
    if (isMounted) {
      localStorage.setItem("upgrade_knowledge_base", JSON.stringify(sources));
    }
  }, [sources, isMounted]);

  const handleAddLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkUrl) return;

    const newSource: KnowledgeSource = {
      id: Math.random().toString(36).substr(2, 9),
      type: "link",
      name: linkName || linkUrl,
      content: linkUrl,
      date: new Date().toLocaleDateString(),
      status: "synced",
    };

    setSources([newSource, ...sources]);
    setLinkName("");
    setLinkUrl("");
    setIsAddOpen(false);
    showSuccessToast("Link added to knowledge base");
  };

  const handleAddFile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileName) return;

    const newSource: KnowledgeSource = {
      id: Math.random().toString(36).substr(2, 9),
      type: "file",
      name: fileName,
      content: fileName,
      date: new Date().toLocaleDateString(),
      status: "synced",
    };

    setSources([newSource, ...sources]);
    setFileName("");
    setIsAddOpen(false);
    showSuccessToast("File added to knowledge base");
  };

  const deleteSource = (id: string) => {
    setSources(sources.filter((s) => s.id !== id));
    showSuccessToast("Source removed");
  };

  const filteredSources = sources.filter((s) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isMounted) return null;

  return (
    <div className="flex-1 space-y-6 p-8 pt-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Knowledge Base</h2>
          <p className="text-muted-foreground">
            Manage your documents and website links to improve agent responses.
          </p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-xl">
              <Plus className="mr-2 h-4 w-4" /> Add Source
            </Button>
          </DialogTrigger>
          <DialogContent
            className="sm:max-w-[425px]"
            // Only the X button should discard typed source details.
            onInteractOutside={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>Add New Source</DialogTitle>
              <DialogDescription>
                Upload a file or link a website to your knowledge base.
              </DialogDescription>
            </DialogHeader>
            <Tabs defaultValue="file" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="file">File</TabsTrigger>
                <TabsTrigger value="link">Website</TabsTrigger>
              </TabsList>
              <TabsContent value="file" className="space-y-4 pt-4">
                <div className="grid w-full items-center gap-1.5">
                  <label htmlFor="filename" className="text-sm font-medium">File Name (Mock)</label>
                  <Input 
                    id="filename" 
                    placeholder="e.g. documentation.pdf" 
                    value={fileName}
                    onChange={(e) => setFileName(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Note: Backend is offline. Currently just mocking the entry.
                  </p>
                </div>
                <Button className="w-full" onClick={handleAddFile} disabled={!fileName}>
                  Add File
                </Button>
              </TabsContent>
              <TabsContent value="link" className="space-y-4 pt-4">
                <div className="grid w-full items-center gap-1.5">
                  <label htmlFor="linkname" className="text-sm font-medium">Name</label>
                  <Input 
                    id="linkname" 
                    placeholder="My Documentation" 
                    value={linkName}
                    onChange={(e) => setLinkName(e.target.value)}
                  />
                </div>
                <div className="grid w-full items-center gap-1.5">
                  <label htmlFor="linkurl" className="text-sm font-medium">URL</label>
                  <Input 
                    id="linkurl" 
                    placeholder="https://example.com" 
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                  />
                </div>
                <Button className="w-full" onClick={handleAddLink} disabled={!linkUrl}>
                  Add Link
                </Button>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center space-x-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search sources..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredSources.length > 0 ? (
          filteredSources.map((source) => (
            <Card key={source.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {source.type === "file" ? (
                      <FileText className="h-5 w-5 text-blue-500" />
                    ) : (
                      <Globe className="h-5 w-5 text-green-500" />
                    )}
                    <CardTitle className="text-base truncate max-w-[150px]">
                      {source.name}
                    </CardTitle>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteSource(source.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <CardDescription className="truncate">
                  {source.content}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Added on {source.date}</span>
                  <span className="flex items-center text-green-600 font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-600 mr-1.5" />
                    Synced
                  </span>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="col-span-full py-12 text-center border-2 border-dashed rounded-xl">
            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="p-3 bg-muted rounded-full">
                <Database className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-medium">No sources found</h3>
                <p className="text-sm text-muted-foreground">
                  Start by adding a file or a website link to your knowledge base.
                </p>
              </div>
              <Button variant="outline" onClick={() => setIsAddOpen(true)}>
                Add your first source
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default KnowledgeBasePage;