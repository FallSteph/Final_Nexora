import { useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LogEntry {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning';
  timestamp: Date;
}

interface ActivityLogProps {
  entries: LogEntry[];
}

const ActivityLog = ({ entries }: ActivityLogProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  return (
    <Card className="mt-6">
      <CardHeader className="py-3 px-4 bg-foreground text-background rounded-t-lg">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Activity Log
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[180px]" ref={scrollRef}>
          <div className="log-container">
            {entries.length === 0 ? (
              <div className="log-entry text-muted-foreground italic">
                No activity yet. Click "Edit" on any admin panel to start.
              </div>
            ) : (
              entries.map((entry) => (
                <div
                  key={entry.id}
                  className={cn(
                    'log-entry animate-fade-in',
                    entry.type === 'success' && 'log-entry-success',
                    entry.type === 'warning' && 'log-entry-warning',
                    entry.type === 'info' && 'log-entry-info'
                  )}
                >
                  <span className="text-muted-foreground mr-2">
                    [{entry.timestamp.toLocaleTimeString()}]
                  </span>
                  {entry.message}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default ActivityLog;
