import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle
} from '@/components/ui/Card';
import { Pencil, Plus, Trash2, Wrench } from 'lucide-react';

const mockSkills = [
  { id: '1', name: '文件读取', description: '读取本地文件内容', type: 'tool' },
  {
    id: '2',
    name: '网络搜索',
    description: '通过搜索引擎获取信息',
    type: 'retrieval',
  },
  {
    id: '3',
    name: '代码执行',
    description: '执行代码片段并返回结果',
    type: 'tool',
  },
];

const typeLabels: Record<string, string> = {
  tool: '工具',
  retrieval: '检索',
  generation: '生成',
  mcp: 'MCP',
};

const typeVariants: Record<
  string,
  'default' | 'secondary' | 'outline' | 'success' | 'warning'
> = {
  tool: 'default',
  retrieval: 'success',
  generation: 'warning',
  mcp: 'secondary',
};

export default function SkillsPage() {
  return (
    <div className="flex flex-1 flex-col overflow-auto p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Skill 管理</h1>
          <p className="text-muted-foreground">
            定义和管理 AI 可调用的技能与工具
          </p>
        </div>
        <Button>
          <Plus className="mr-2 " />
          新建 Skill
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {mockSkills.map((skill) => (
          <Card key={skill.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-success/10 flex h-10 w-10 items-center justify-center rounded-full">
                    <Wrench className="text-success " />
                  </div>
                  <div>
                    <CardTitle className="text-base">{skill.name}</CardTitle>
                  </div>
                </div>
                <Badge variant={typeVariants[skill.type] || 'default'}>
                  {typeLabels[skill.type] || skill.type}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              <p className="text-muted-foreground mb-4 text-sm">
                {skill.description}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="flex-1">
                  <Pencil className="mr-1 h-[14px] w-[14px]" />
                  编辑
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 flex-1"
                >
                  <Trash2 className="mr-1 h-[14px] w-[14px]" />
                  删除
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
