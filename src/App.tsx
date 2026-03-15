/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  LayoutGrid,
  List,
  Package, 
  ArrowLeftRight, 
  History, 
  Plus, 
  Search, 
  Filter, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  User, 
  ChevronRight, 
  PackagePlus, 
  PackageMinus,
  Camera,
  Upload,
  X,
  MapPin,
  Tag,
  Info,
  Menu,
  MoreVertical,
  Trash2,
  Edit3,
  RefreshCw,
  Download,
  ClipboardCheck,
  ShoppingCart,
  CheckSquare,
  Square,
  Trash
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import { format, subDays, isAfter, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Types
interface Product {
  id: number;
  name: string;
  model: string;
  code: string;
  category: string;
  location: string;
  quantity: number;
  unit: string;
  description: string;
  dimensions: string;
  photo: string | null;
  purchase_requested: number;
  min_stock: number;
  max_stock: number;
  created_at: string;
}

interface Task {
  id: number;
  text: string;
  completed: number;
  created_at: string;
  completed_at: string | null;
}

interface Movement {
  id: number;
  product_id: number;
  product_name: string;
  product_code: string;
  type: 'IN' | 'OUT';
  quantity: number;
  responsible: string;
  date: string;
}

interface DashboardData {
  totalProducts: number;
  lowStock: number;
  outOfStock: number;
  purchaseRequests: number;
  recentMovements: Movement[];
  categoryStats: { category: string; count: number }[];
  withdrawalFrequency: { day: string; count: number }[];
  withdrawalsByCategoryPerDay: { day: string; category: string; quantity: number }[];
}

// Constants
const CATEGORIES = [
  'Consumíveis', 
  'Rolamentos', 
  'Retentores', 
  'Material Elétrico', 
  'Material Hidráulico', 
  'Pneumático', 
  'Automação', 
  'Correias', 
  'Específicos Moinho', 
  'Específicos Haver', 
  'Específicos Nilpan',
  'Específicos Expedição',
  'Universal',
  'Bloqueado'
];
const LOCATIONS = Array.from({ length: 50 }, (_, i) => `A${i + 1}`);

const STOCK_RULES = (qty: number, min: number = 3, max: number = 10) => {
  if (qty <= min) return { color: 'text-red-600 bg-red-50 border-red-100', label: 'Baixo' };
  if (qty <= max) return { color: 'text-emerald-600 bg-emerald-50 border-emerald-100', label: 'Ideal' };
  return { color: 'text-amber-600 bg-amber-50 border-amber-100', label: 'Alto' };
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'products' | 'movements' | 'history' | 'inventory' | 'purchase' | 'tasks'>('dashboard');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskText, setNewTaskText] = useState('');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [timeFilter, setTimeFilter] = useState<number | null>(null); // days
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'zero'>('all');
  const [inventoryCategory, setInventoryCategory] = useState<string>('');
  const [inventoryCounts, setInventoryCounts] = useState<Record<number, number>>({});
  const [isFinalizingInventory, setIsFinalizingInventory] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<Product | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [skuCode, setSkuCode] = useState('');
  const [skuExists, setSkuExists] = useState(false);
  const [nameModelExists, setNameModelExists] = useState(false);
  const [ignoreDuplicate, setIgnoreDuplicate] = useState(false);
  const [productName, setProductName] = useState('');
  const [productModel, setProductModel] = useState('');
  const [skuHistory, setSkuHistory] = useState<string[]>([]);
  const [showMovementModal, setShowMovementModal] = useState<Product | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<Product | null>(null);
  const [movementType, setMovementType] = useState<'IN' | 'OUT'>('IN');
  const [withdrawalConfirmed, setWithdrawalConfirmed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [photo, setPhoto] = useState<string | null>(null);

  const activities = useMemo(() => {
    const movs = movements.map(m => ({
      id: `mov-${m.id}`,
      type: 'MOVEMENT',
      date: m.date,
      title: m.product_name,
      subtitle: m.product_code,
      action: m.type === 'IN' ? 'Entrada' : 'Saída',
      quantity: m.quantity,
      responsible: m.responsible,
      color: m.type === 'IN' ? 'emerald' : 'red'
    }));

    const completedTasks = tasks.filter(t => t.completed === 1 && t.completed_at).map(t => ({
      id: `task-${t.id}`,
      type: 'TASK',
      date: t.completed_at!,
      title: t.text,
      subtitle: 'Tarefa Concluída',
      action: 'Concluída',
      quantity: null,
      responsible: 'Sistema',
      color: 'blue'
    }));

    return [...movs, ...completedTasks].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [movements, tasks]);

  // Fetch data
  const fetchData = async () => {
    setLoading(true);
    try {
      const [prodRes, dashRes, taskRes, movRes] = await Promise.all([
        fetch('/api/products'),
        fetch('/api/dashboard'),
        fetch('/api/tasks'),
        fetch('/api/movements')
      ]);
      const prodData = await prodRes.json();
      const dashData = await dashRes.json();
      const taskData = await taskRes.json();
      const movData = await movRes.json();
      setProducts(prodData);
      setDashboard(dashData);
      setTasks(taskData);
      setMovements(movData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportProductsToCSV = () => {
    const headers = ['Nome', 'Código/SKU', 'Modelo', 'Medidas', 'Categoria', 'Localização', 'Quantidade', 'Unidade', 'Data Cadastro'];
    const rows = filteredProducts.map(p => [
      p.name,
      p.code,
      p.model || 'N/A',
      p.dimensions || 'N/A',
      p.category,
      p.location,
      p.quantity,
      p.unit,
      new Date(p.created_at).toLocaleDateString('pt-BR')
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `produtos_estoque_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportHistoryToCSV = () => {
    const dataToExport = activities.length > 0 ? activities : [];
    if (dataToExport.length === 0) return;
    
    const headers = ['Data', 'Atividade', 'Detalhes', 'Tipo', 'Quantidade', 'Responsável'];
    const rows = dataToExport.map(a => [
      new Date(a.date).toLocaleString('pt-BR'),
      a.title,
      a.subtitle,
      a.action,
      a.quantity || '—',
      a.responsible
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `historico_movimentacoes_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Fetch next SKU
  const fetchNextSku = async () => {
    try {
      const res = await fetch('/api/products/next-code');
      const data = await res.json();
      setSkuCode(data.nextCode);
      setSkuExists(false);
      
      // Also fetch last 5 SKUs for history
      const lastSkus = products
        .filter(p => /^\d{6}$/.test(p.code))
        .sort((a, b) => b.code.localeCompare(a.code))
        .slice(0, 5)
        .map(p => p.code);
      setSkuHistory(lastSkus);
    } catch (error) {
      console.error('Error fetching next SKU:', error);
    }
  };

  // Check SKU duplicity
  useEffect(() => {
    if (skuCode.length > 0 && showAddModal) {
      const timer = setTimeout(async () => {
        try {
          const res = await fetch(`/api/products/check-code/${skuCode}`);
          const data = await res.json();
          setSkuExists(data.exists);
        } catch (error) {
          console.error('Error checking SKU:', error);
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [skuCode, showAddModal]);

  // Check Name + Model duplicity
  useEffect(() => {
    const isModalOpen = showAddModal || showEditModal;
    if (productName.length > 2 && isModalOpen) {
      const timer = setTimeout(async () => {
        try {
          const excludeId = showEditModal ? showEditModal.id : '';
          const res = await fetch(`/api/products/check-duplicate?name=${encodeURIComponent(productName)}&model=${encodeURIComponent(productModel)}&excludeId=${excludeId}`);
          const data = await res.json();
          setNameModelExists(data.exists);
        } catch (error) {
          console.error('Error checking duplicate:', error);
        }
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setNameModelExists(false);
    }
  }, [productName, productModel, showAddModal, showEditModal]);

  useEffect(() => {
    if (showAddModal) {
      fetchNextSku();
    } else if (!showEditModal) {
      setSkuCode('');
      setSkuExists(false);
    }
  }, [showAddModal, showEditModal]);

  useEffect(() => {
    if (showEditModal) {
      setProductName(showEditModal.name);
      setProductModel(showEditModal.model || '');
      setIgnoreDuplicate(false);
      setPhoto(showEditModal.photo);
    } else if (!showAddModal) {
      setProductName('');
      setProductModel('');
      setIgnoreDuplicate(false);
      setPhoto(null);
    }
  }, [showEditModal, showAddModal]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || 
                           p.code.toLowerCase().includes(search.toLowerCase()) ||
                           p.model.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter ? p.category === categoryFilter : true;
      
      let matchesTime = true;
      if (timeFilter) {
        const cutoffDate = subDays(new Date(), timeFilter);
        matchesTime = isAfter(parseISO(p.created_at), cutoffDate);
      }

      let matchesStock = true;
      if (stockFilter === 'low') matchesStock = p.quantity <= 3 && p.quantity > 0;
      if (stockFilter === 'zero') matchesStock = p.quantity === 0;

      return matchesSearch && matchesCategory && matchesTime && matchesStock;
    }).sort((a, b) => a.code.localeCompare(b.code));
  }, [products, search, categoryFilter, timeFilter, stockFilter]);

  const categoryWithdrawalData = useMemo(() => {
    if (!dashboard?.withdrawalsByCategoryPerDay) return [];
    
    const days: Record<string, any> = {};
    dashboard.withdrawalsByCategoryPerDay.forEach(item => {
      if (!days[item.day]) {
        days[item.day] = { day: item.day };
      }
      days[item.day][item.category] = item.quantity;
    });
    
    return Object.values(days).sort((a, b) => a.day.localeCompare(b.day));
  }, [dashboard?.withdrawalsByCategoryPerDay]);

  const activeCategories = useMemo(() => {
    if (!dashboard?.withdrawalsByCategoryPerDay) return [];
    return Array.from(new Set(dashboard.withdrawalsByCategoryPerDay.map(item => item.category)));
  }, [dashboard?.withdrawalsByCategoryPerDay]);

  const CATEGORY_COLORS: Record<string, string> = {
    'Consumíveis': '#064e3b',
    'Rolamentos': '#059669',
    'Retentores': '#10b981',
    'Material Elétrico': '#34d399',
    'Material Hidráulico': '#6ee7b7',
    'Pneumático': '#a7f3d0',
    'Automação': '#d1fae5',
    'Correias': '#ecfdf5',
    'Específicos Moinho': '#065f46',
    'Específicos Haver': '#047857',
    'Específicos Nilpan': '#059669',
    'Específicos Expedição': '#10b981',
    'Universal': '#34d399',
    'Bloqueado': '#ef4444'
  };

  // Handlers
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      ...Object.fromEntries(formData.entries()),
      photo: photo
    };
    
    if (skuCode.length > 0 && /^\d+$/.test(skuCode) && skuCode.length !== 6) {
      setFormError('O código numérico deve ter exatamente 6 dígitos.');
      return;
    }
    
    if (skuExists) {
      setFormError('Este código já está em uso. Por favor, escolha outro.');
      return;
    }

    if (nameModelExists && !ignoreDuplicate) {
      setFormError('Já existe um produto com este nome e modelo. Marque "Ignorar duplicidade" para prosseguir.');
      return;
    }
    
    setFormError(null);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setShowAddModal(false);
        setPhoto(null);
        setProductName('');
        setProductModel('');
        setIgnoreDuplicate(false);
        fetchData();
      } else {
        const err = await res.json();
        setFormError(err.error || 'Erro ao cadastrar produto');
      }
    } catch (error) {
      console.error('Error adding product:', error);
      setFormError('Erro de conexão com o servidor');
    }
  };

  const handleEditProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!showEditModal) return;

    if (nameModelExists && !ignoreDuplicate) {
      setFormError('Já existe outro produto com este nome e modelo. Marque "Ignorar duplicidade" para prosseguir.');
      return;
    }
    
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name'),
      model: formData.get('model'),
      dimensions: formData.get('dimensions'),
      category: formData.get('category'),
      location: formData.get('location'),
      unit: formData.get('unit'),
      description: formData.get('description'),
      photo: photo,
      min_stock: formData.get('min_stock'),
      max_stock: formData.get('max_stock'),
    };

    try {
      const res = await fetch(`/api/products/${showEditModal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setShowEditModal(null);
        setPhoto(null);
        fetchData();
      } else {
        const err = await res.json();
        setFormError(err.error);
      }
    } catch (error) {
      console.error('Error editing product:', error);
    }
  };

  const handleDeleteProduct = async (id: number) => {
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setShowDeleteConfirm(null);
        fetchData();
      }
    } catch (error) {
      console.error('Error deleting product:', error);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskText.trim()) return;
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newTaskText }),
      });
      if (res.ok) {
        setNewTaskText('');
        fetchData();
      }
    } catch (error) {
      console.error('Error adding task:', error);
    }
  };

  const handleToggleTask = async (id: number) => {
    try {
      const res = await fetch(`/api/tasks/${id}/toggle`, { method: 'PUT' });
      if (res.ok) fetchData();
    } catch (error) {
      console.error('Error toggling task:', error);
    }
  };

  const handleDeleteTask = async (id: number) => {
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
      if (res.ok) fetchData();
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  };

  const handleTogglePurchase = async (id: number) => {
    try {
      const res = await fetch(`/api/products/${id}/toggle-purchase`, {
        method: 'POST',
      });
      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error('Error toggling purchase request:', error);
    }
  };

  const handleMovement = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!showMovementModal) return;
    
    const formData = new FormData(e.currentTarget);
    const data = {
      product_id: showMovementModal.id,
      type: movementType,
      quantity: Number(formData.get('quantity')),
      responsible: formData.get('responsible'),
      date: formData.get('date'),
    };

    try {
      const res = await fetch('/api/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setShowMovementModal(null);
        fetchData();
      } else {
        const err = await res.json();
        alert(err.error);
      }
    } catch (error) {
      console.error('Error movement:', error);
    }
  };

  const handleInventorySubmit = async () => {
    if (!inventoryCategory) return;
    
    const productsToUpdate = products.filter(p => p.category === inventoryCategory);
    const adjustments = productsToUpdate.map(p => {
      const actualQty = inventoryCounts[p.id] ?? p.quantity;
      const diff = actualQty - p.quantity;
      return {
        product_id: p.id,
        type: diff >= 0 ? 'IN' : 'OUT',
        quantity: Math.abs(diff),
        responsible: 'Sistema (Inventário)',
        diff
      };
    }).filter(a => a.diff !== 0);

    if (adjustments.length === 0) {
      alert('Nenhuma alteração detectada.');
      return;
    }

    if (!confirm(`Deseja aplicar ${adjustments.length} ajustes de estoque para a categoria ${inventoryCategory}?`)) return;

    setIsFinalizingInventory(true);
    try {
      for (const adj of adjustments) {
        await fetch('/api/movements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_id: adj.product_id,
            type: adj.type,
            quantity: adj.quantity,
            responsible: adj.responsible
          }),
        });
      }
      alert('Inventário finalizado com sucesso!');
      setInventoryCounts({});
      fetchData();
    } catch (error) {
      console.error('Error finalizing inventory:', error);
      alert('Erro ao finalizar inventário.');
    } finally {
      setIsFinalizingInventory(false);
    }
  };

  const NavItem = ({ id, icon: Icon, label }: { id: typeof activeTab, icon: any, label: string }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg transition-all duration-200 ${
        activeTab === id 
          ? 'bg-emerald-900 text-white shadow-lg shadow-emerald-900/20' 
          : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      <Icon size={20} />
      <span className={`font-medium ${!sidebarOpen && 'hidden'}`}>{label}</span>
    </button>
  );

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-white border-r border-slate-200 p-4 transition-all duration-300 flex flex-col gap-6 z-20`}>
        <div className="px-2">
          {sidebarOpen ? (
            <div className="space-y-1">
              <h1 className="font-bold text-emerald-900 text-xl leading-none">Orquidea</h1>
              <div className="flex items-center gap-2">
                <img 
                  src="https://www.orquidea.com.br/wp-content/uploads/2021/04/logo-orquidea.png" 
                  alt="Orquidea Logo" 
                  className="h-6 object-contain"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <p className="text-[10px] text-slate-400 font-bold tracking-wide uppercase">Almoxarifado Industrial</p>
              </div>
            </div>
          ) : (
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shrink-0 shadow-sm border border-slate-100 overflow-hidden p-1">
              <img 
                src="https://www.orquidea.com.br/wp-content/uploads/2021/04/logo-orquidea.png" 
                alt="Orquidea Logo" 
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
          )}
        </div>

        <nav className="flex flex-col gap-2 flex-1">
          <NavItem id="dashboard" icon={LayoutDashboard} label="Dashboard" />
          <NavItem id="products" icon={Package} label="Produtos" />
          <NavItem id="movements" icon={ArrowLeftRight} label="Movimentações" />
          <NavItem id="purchase" icon={ShoppingCart} label="Lista de Compras" />
          <NavItem id="tasks" icon={CheckSquare} label="Tarefas" />
          <NavItem id="inventory" icon={ClipboardCheck} label="Inventário" />
          <NavItem id="history" icon={History} label="Histórico" />
        </nav>

        <button 
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors self-center"
        >
          <Menu size={20} />
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white/80 backdrop-blur-md border-bottom border-slate-200 flex items-center justify-between px-8 shrink-0 z-10">
          <div className="flex items-center gap-4">
            <img 
              src="https://www.orquidea.com.br/wp-content/uploads/2021/04/logo-orquidea.png" 
              alt="Orquidea Logo" 
              className="h-8 object-contain hidden md:block"
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <h2 className="text-xl font-semibold text-slate-800 capitalize">
              {activeTab === 'dashboard' ? 'Visão Geral' : 
               activeTab === 'products' ? 'Controle de Estoque' : 
               activeTab === 'movements' ? 'Entradas e Saídas' : 
               activeTab === 'purchase' ? 'Lista de Compras' :
               activeTab === 'inventory' ? 'Inventário por Categoria' : 'Histórico de Baixas'}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Pesquisar..." 
                className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-full text-sm w-64 focus:ring-2 focus:ring-emerald-900/20 transition-all outline-none"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-900">
              <User size={18} />
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                        <Package size={24} />
                      </div>
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">+12%</span>
                    </div>
                    <p className="text-slate-500 text-sm font-medium">Total de Itens</p>
                    <h3 className="text-3xl font-bold text-slate-900 mt-1">{dashboard?.totalProducts || 0}</h3>
                  </div>
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-red-50 text-red-600 rounded-xl">
                        <AlertTriangle size={24} />
                      </div>
                      <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full">Alerta</span>
                    </div>
                    <p className="text-slate-500 text-sm font-medium">Estoque Baixo</p>
                    <h3 className="text-3xl font-bold text-slate-900 mt-1">{dashboard?.lowStock || 0}</h3>
                  </div>
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => { setActiveTab('products'); setStockFilter('zero'); }}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-slate-900 text-white rounded-xl">
                        <PackageMinus size={24} />
                      </div>
                      <span className="text-xs font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded-full">Crítico</span>
                    </div>
                    <p className="text-slate-500 text-sm font-medium">Itens Zerados</p>
                    <h3 className="text-3xl font-bold text-slate-900 mt-1">{dashboard?.outOfStock || 0}</h3>
                  </div>
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => setActiveTab('purchase')}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                        <ShoppingCart size={24} />
                      </div>
                      <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-full">Pendente</span>
                    </div>
                    <p className="text-slate-500 text-sm font-medium">Para Comprar</p>
                    <h3 className="text-3xl font-bold text-slate-900 mt-1">{dashboard?.purchaseRequests || 0}</h3>
                  </div>
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                        <ArrowLeftRight size={24} />
                      </div>
                      <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full">Hoje</span>
                    </div>
                    <p className="text-slate-500 text-sm font-medium">Movimentações</p>
                    <h3 className="text-3xl font-bold text-slate-900 mt-1">{dashboard?.recentMovements.length || 0}</h3>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Recent Activity */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                      <h4 className="font-bold text-slate-800 flex items-center gap-2">
                        <Clock size={18} className="text-emerald-900" />
                        Atividades Recentes
                      </h4>
                      <button onClick={() => setActiveTab('history')} className="text-sm text-emerald-900 font-semibold hover:underline">Ver tudo</button>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {activities.slice(0, 5).map((a) => (
                        <div key={a.id} className="p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                          <div className={`p-2 rounded-lg ${
                            a.color === 'emerald' ? 'bg-emerald-50 text-emerald-600' : 
                            a.color === 'red' ? 'bg-red-50 text-red-600' : 
                            'bg-blue-50 text-blue-600'
                          }`}>
                            {a.type === 'MOVEMENT' ? (
                              a.action === 'Entrada' ? <PackagePlus size={18} /> : <PackageMinus size={18} />
                            ) : (
                              <CheckSquare size={18} />
                            )}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-slate-800">{a.title}</p>
                            <p className="text-xs text-slate-500">{a.responsible} • {new Date(a.date).toLocaleString('pt-BR')}</p>
                          </div>
                          <div className={`text-sm font-bold ${
                            a.color === 'emerald' ? 'text-emerald-600' : 
                            a.color === 'red' ? 'text-red-600' : 
                            'text-blue-600'
                          }`}>
                            {a.quantity !== null ? `${a.color === 'emerald' ? '+' : '-'}${a.quantity}` : 'OK'}
                          </div>
                        </div>
                      ))}
                      {activities.length === 0 && (
                        <div className="p-12 text-center text-slate-400">Nenhuma atividade recente</div>
                      )}
                    </div>
                  </div>

                  {/* Categories Distribution */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                      <h4 className="font-bold text-slate-800 flex items-center gap-2">
                        <Tag size={18} className="text-emerald-900" />
                        Distribuição por Categoria
                      </h4>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input 
                          type="text" 
                          placeholder="Buscar categoria..." 
                          value={categorySearch}
                          onChange={(e) => setCategorySearch(e.target.value)}
                          className="pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-xs outline-none focus:ring-2 focus:ring-emerald-900/10 transition-all w-full sm:w-48"
                        />
                      </div>
                    </div>
                    <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                      {dashboard?.categoryStats
                        .filter(stat => stat.category.toLowerCase().includes(categorySearch.toLowerCase()))
                        .map((stat) => (
                        <div key={stat.category} className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium text-slate-600">{stat.category}</span>
                            <span className="font-bold text-slate-900">{stat.count} itens</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-emerald-900 rounded-full" 
                              style={{ width: `${(stat.count / (dashboard.totalProducts || 1)) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                      {dashboard?.categoryStats.filter(stat => stat.category.toLowerCase().includes(categorySearch.toLowerCase())).length === 0 && (
                        <div className="text-center py-8 text-slate-400 text-sm">
                          Nenhuma categoria encontrada
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Withdrawal Frequency Chart */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mt-8">
                  <h4 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <ArrowLeftRight size={18} className="text-emerald-900" />
                    Frequência de Retiradas (Últimos 30 dias)
                  </h4>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={dashboard?.withdrawalFrequency || []}>
                        <defs>
                          <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#064e3b" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#064e3b" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="day" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fill: '#94a3b8' }}
                          tickFormatter={(str) => format(parseISO(str), 'dd/MM', { locale: ptBR })}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fill: '#94a3b8' }}
                        />
                        <Tooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          labelFormatter={(str) => format(parseISO(str), 'dd/MM/yyyy', { locale: ptBR })}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="count" 
                          name="Retiradas"
                          stroke="#064e3b" 
                          strokeWidth={2}
                          fillOpacity={1} 
                          fill="url(#colorCount)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Withdrawals by Category Chart */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mt-8">
                  <h4 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <LayoutGrid size={18} className="text-emerald-900" />
                    Saídas por Categoria (Últimos 7 dias)
                  </h4>
                  <div className="h-[400px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={categoryWithdrawalData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="day" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fill: '#94a3b8' }}
                          tickFormatter={(str) => format(parseISO(str), 'dd/MM', { locale: ptBR })}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fill: '#94a3b8' }}
                        />
                        <Tooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          labelFormatter={(str) => format(parseISO(str), 'dd/MM/yyyy', { locale: ptBR })}
                        />
                        <Legend 
                          verticalAlign="top" 
                          align="right" 
                          iconType="circle"
                          wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', paddingBottom: '20px' }}
                        />
                        {activeCategories.map((category) => (
                          <Bar 
                            key={category} 
                            dataKey={category} 
                            stackId="a" 
                            fill={CATEGORY_COLORS[category] || '#94a3b8'} 
                            radius={[0, 0, 0, 0]}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'products' && (
              <motion.div 
                key="products"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex flex-col gap-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        <Filter size={16} className="text-emerald-900" />
                        Categorias
                      </h3>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {categoryFilter || 'Todas as Categorias'}
                      </span>
                    </div>
                    
                    <div className="relative group">
                      <div className="absolute inset-0 bg-slate-200/20 blur-xl rounded-3xl -z-10 group-hover:bg-emerald-900/5 transition-colors duration-500" />
                      <div className="flex flex-wrap gap-2 p-2 bg-white/60 backdrop-blur-md border border-slate-200/60 rounded-2xl shadow-sm">
                        <button
                          onClick={() => setCategoryFilter('')}
                          className={`relative px-4 py-2 rounded-xl text-xs font-bold transition-all duration-300 ${
                            categoryFilter === '' 
                              ? 'text-white' 
                              : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-700'
                          }`}
                        >
                          {categoryFilter === '' && (
                            <motion.div 
                              layoutId="activeCategory"
                              className="absolute inset-0 bg-emerald-900 rounded-xl shadow-lg shadow-emerald-900/20 -z-10"
                              transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                            />
                          )}
                          Todas
                        </button>
                        
                        {CATEGORIES.map(cat => {
                          const count = products.filter(p => p.category === cat).length;
                          return (
                            <button
                              key={cat}
                              onClick={() => setCategoryFilter(cat)}
                              className={`relative px-4 py-2 rounded-xl text-xs font-bold transition-all duration-300 flex items-center gap-2 ${
                                categoryFilter === cat 
                                  ? 'text-white' 
                                  : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-700'
                              }`}
                            >
                              {categoryFilter === cat && (
                                <motion.div 
                                  layoutId="activeCategory"
                                  className="absolute inset-0 bg-emerald-900 rounded-xl shadow-lg shadow-emerald-900/20 -z-10"
                                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                />
                              )}
                              {cat}
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${categoryFilter === cat ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                {count}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="flex flex-wrap gap-4">
                      <div className="flex bg-white/60 backdrop-blur-md border border-slate-200/60 rounded-2xl p-1 shadow-sm">
                        {[
                          { label: '7 dias', val: 7 },
                          { label: '30 dias', val: 30 },
                          { label: '90 dias', val: 90 }
                        ].map(opt => (
                          <button
                            key={opt.val}
                            onClick={() => setTimeFilter(timeFilter === opt.val ? null : opt.val)}
                            className={`relative px-5 py-2 rounded-xl text-xs font-bold transition-all duration-300 ${
                              timeFilter === opt.val 
                                ? 'text-white' 
                                : 'text-slate-500 hover:bg-slate-100/80'
                            }`}
                          >
                            {timeFilter === opt.val && (
                              <motion.div 
                                layoutId="activeTime"
                                className="absolute inset-0 bg-emerald-900 rounded-xl shadow-md -z-10"
                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                              />
                            )}
                            {opt.label}
                          </button>
                        ))}
                      </div>

                      <div className="flex bg-white/60 backdrop-blur-md border border-slate-200/60 rounded-2xl p-1 shadow-sm">
                        {[
                          { label: 'Todos', val: 'all' },
                          { label: 'Baixo', val: 'low' },
                          { label: 'Zerados', val: 'zero' }
                        ].map(opt => (
                          <button
                            key={opt.val}
                            onClick={() => setStockFilter(opt.val as any)}
                            className={`relative px-5 py-2 rounded-xl text-xs font-bold transition-all duration-300 ${
                              stockFilter === opt.val 
                                ? 'text-white' 
                                : 'text-slate-500 hover:bg-slate-100/80'
                            }`}
                          >
                            {stockFilter === opt.val && (
                              <motion.div 
                                layoutId="activeStock"
                                className="absolute inset-0 bg-emerald-900 rounded-xl shadow-md -z-10"
                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                              />
                            )}
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-3 w-full md:w-auto">
                      <div className="flex bg-white/60 backdrop-blur-md border border-slate-200/60 rounded-2xl p-1 shadow-sm">
                        <button
                          onClick={() => setViewMode('grid')}
                          className={`relative p-2 rounded-xl transition-all duration-300 ${
                            viewMode === 'grid' ? 'text-white' : 'text-slate-500 hover:bg-slate-100/80'
                          }`}
                          title="Visualização em Grade"
                        >
                          {viewMode === 'grid' && (
                            <motion.div 
                              layoutId="activeView"
                              className="absolute inset-0 bg-emerald-900 rounded-xl shadow-md -z-10"
                              transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                            />
                          )}
                          <LayoutGrid size={20} />
                        </button>
                        <button
                          onClick={() => setViewMode('list')}
                          className={`relative p-2 rounded-xl transition-all duration-300 ${
                            viewMode === 'list' ? 'text-white' : 'text-slate-500 hover:bg-slate-100/80'
                          }`}
                          title="Visualização em Lista"
                        >
                          {viewMode === 'list' && (
                            <motion.div 
                              layoutId="activeView"
                              className="absolute inset-0 bg-emerald-900 rounded-xl shadow-md -z-10"
                              transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                            />
                          )}
                          <List size={20} />
                        </button>
                      </div>
                      <button 
                        onClick={exportProductsToCSV}
                        className="flex items-center gap-2 bg-white text-slate-700 border border-slate-200 px-6 py-2.5 rounded-xl font-bold shadow-sm hover:bg-slate-50 transition-all w-full md:w-auto justify-center"
                      >
                        <Download size={20} />
                        Exportar CSV
                      </button>
                      <button 
                        onClick={() => { setFormError(null); setShowAddModal(true); }}
                        className="flex items-center gap-2 bg-emerald-900 text-white px-8 py-3 rounded-2xl font-bold shadow-xl shadow-emerald-900/20 hover:scale-[1.02] active:scale-[0.98] transition-all w-full md:w-auto justify-center group"
                      >
                        <Plus size={20} className="group-hover:rotate-90 transition-transform duration-300" />
                        Novo Produto
                      </button>
                    </div>
                  </div>
                </div>

                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {filteredProducts.map((p) => {
                    const status = STOCK_RULES(p.quantity, p.min_stock, p.max_stock);
                    return (
                      <div key={p.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all group">
                        <div className="p-5 space-y-4">
                          <div className="flex gap-4">
                            <div className="w-20 h-20 bg-slate-100 rounded-xl shrink-0 overflow-hidden flex items-center justify-center text-slate-300">
                              {p.photo ? (
                                <img src={p.photo} alt={p.name} className="w-full h-full object-cover" />
                              ) : (
                                <Package size={32} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between">
                                <span className="text-[10px] font-bold text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded uppercase tracking-wider">{p.category}</span>
                                <div className="flex items-center gap-2">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${status.color}`}>{status.label}</span>
                                  <button 
                                    onClick={() => {
                                      setShowEditModal(p);
                                      setPhoto(p.photo);
                                      setFormError(null);
                                    }}
                                    className="p-1.5 text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                    title="Editar Produto"
                                  >
                                    <Edit3 size={14} />
                                  </button>
                                  <button 
                                    onClick={() => setShowDeleteConfirm(p)}
                                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                    title="Excluir Produto"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                              <h5 className="font-bold text-slate-800 truncate mt-1">{p.name}</h5>
                              <p className="text-xs text-slate-400 font-medium">
                                <span className="font-mono text-emerald-900 bg-emerald-50/50 px-1 rounded">{p.code}</span> • {p.model || 'N/A'}
                              </p>
                              {p.dimensions && (
                                <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                                  <Tag size={10} className="text-emerald-900" />
                                  {p.dimensions}
                                </p>
                              )}
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50">
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Localização</p>
                              <p className="text-sm font-bold text-slate-700 flex items-center gap-1">
                                <MapPin size={14} className="text-emerald-900" />
                                {p.location}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estoque</p>
                              <p className="text-sm font-bold text-slate-900">{p.quantity} {p.unit}</p>
                            </div>
                          </div>

                          <div className="flex gap-2 pt-2">
                            <button 
                              onClick={() => { setMovementType('IN'); setWithdrawalConfirmed(false); setShowMovementModal(p); }}
                              className="flex-1 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-colors flex items-center justify-center gap-1"
                            >
                              <PackagePlus size={14} /> Entrada
                            </button>
                            <button 
                              onClick={() => { setMovementType('OUT'); setWithdrawalConfirmed(false); setShowMovementModal(p); }}
                              className="flex-1 py-2 bg-red-50 text-red-700 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors flex items-center justify-center gap-1"
                            >
                              <PackageMinus size={14} /> Saída
                            </button>
                          </div>
                          <button 
                            onClick={() => handleTogglePurchase(p.id)}
                            className={`w-full mt-2 py-2 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1 ${
                              p.purchase_requested 
                                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' 
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            <ShoppingCart size={14} /> 
                            {p.purchase_requested ? 'Remover da Lista' : 'Solicitar Compra'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {filteredProducts.length === 0 && !loading && (
                    <div className="col-span-full py-20 text-center space-y-4">
                      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-300">
                        <Search size={32} />
                      </div>
                      <p className="text-slate-400 font-medium">Nenhum produto encontrado</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Produto</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Código</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Categoria</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Localização</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estoque</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredProducts.map((p) => {
                          const status = STOCK_RULES(p.quantity, p.min_stock, p.max_stock);
                          return (
                            <tr key={p.id} className="hover:bg-slate-50/50 transition-colors group">
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-slate-100 rounded-lg shrink-0 overflow-hidden flex items-center justify-center text-slate-300">
                                    {p.photo ? (
                                      <img src={p.photo} alt={p.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                    ) : (
                                      <Package size={20} />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-bold text-slate-800 truncate">{p.name}</p>
                                    <p className="text-[10px] text-slate-400 truncate">{p.model || 'N/A'}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className="font-mono text-xs text-emerald-900 bg-emerald-50 px-1.5 py-0.5 rounded">{p.code}</span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded uppercase">{p.category}</span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-1 text-sm text-slate-600">
                                  <MapPin size={14} className="text-emerald-900" />
                                  {p.location}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <p className="text-sm font-bold text-slate-900">{p.quantity} {p.unit}</p>
                              </td>
                              <td className="px-6 py-4">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${status.color}`}>{status.label}</span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center justify-end gap-2">
                                  <button 
                                    onClick={() => { setMovementType('IN'); setWithdrawalConfirmed(false); setShowMovementModal(p); }}
                                    className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                                    title="Entrada"
                                  >
                                    <PackagePlus size={16} />
                                  </button>
                                  <button 
                                    onClick={() => { setMovementType('OUT'); setWithdrawalConfirmed(false); setShowMovementModal(p); }}
                                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                    title="Saída"
                                  >
                                    <PackageMinus size={16} />
                                  </button>
                                  <button 
                                    onClick={() => {
                                      setShowEditModal(p);
                                      setPhoto(p.photo);
                                      setFormError(null);
                                    }}
                                    className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                                    title="Editar"
                                  >
                                    <Edit3 size={16} />
                                  </button>
                                  <button 
                                    onClick={() => handleTogglePurchase(p.id)}
                                    className={`p-2 rounded-lg transition-all ${
                                      p.purchase_requested 
                                        ? 'text-amber-600 bg-amber-50' 
                                        : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                                    }`}
                                    title={p.purchase_requested ? "Remover da Lista" : "Solicitar Compra"}
                                  >
                                    <ShoppingCart size={16} />
                                  </button>
                                  <button 
                                    onClick={() => setShowDeleteConfirm(p)}
                                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                    title="Excluir"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {filteredProducts.length === 0 && !loading && (
                          <tr>
                            <td colSpan={7} className="py-20 text-center">
                              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-300 mb-4">
                                <Search size={32} />
                              </div>
                              <p className="text-slate-400 font-medium">Nenhum produto encontrado</p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              </motion.div>
            )}

            {activeTab === 'movements' && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-800">Entradas e Saídas</h2>
                    <p className="text-slate-500">Histórico completo de movimentações do estoque</p>
                  </div>
                  <button 
                    onClick={exportHistoryToCSV}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
                  >
                    <History size={18} />
                    Exportar CSV
                  </button>
                </div>

                <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/50 border-b border-slate-100">
                          <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Data/Hora</th>
                          <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Produto</th>
                          <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Código</th>
                          <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Tipo</th>
                          <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Qtd</th>
                          <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Responsável</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {activities.map((a) => (
                          <tr key={a.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="text-sm font-medium text-slate-700">
                                {format(new Date(a.date), 'dd/MM/yyyy')}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {format(new Date(a.date), 'HH:mm')}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm font-bold text-slate-800">{a.title}</div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[10px] font-mono font-bold">
                                {a.subtitle}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                a.color === 'emerald' ? 'bg-emerald-100 text-emerald-700' : 
                                a.color === 'red' ? 'bg-red-100 text-red-700' : 
                                'bg-blue-100 text-blue-700'
                              }`}>
                                {a.action}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              {a.quantity !== null ? (
                                <span className={`text-sm font-bold ${a.color === 'emerald' ? 'text-emerald-600' : 'text-red-600'}`}>
                                  {a.color === 'emerald' ? '+' : '-'}{a.quantity}
                                </span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center">
                                  <User size={12} className="text-slate-400" />
                                </div>
                                <span className="text-sm text-slate-600 font-medium">{a.responsible}</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {activities.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">
                              Nenhuma atividade registrada.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'inventory' && (
              <motion.div 
                key="inventory"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <div className="flex flex-col md:flex-row gap-4 items-end justify-between">
                    <div className="space-y-2 flex-1">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Selecione a Categoria para Inventário</label>
                      <select 
                        value={inventoryCategory}
                        onChange={(e) => {
                          setInventoryCategory(e.target.value);
                          setInventoryCounts({});
                        }}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-900/20 outline-none transition-all"
                      >
                        <option value="">Selecione uma categoria...</option>
                        {CATEGORIES.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                    <button 
                      onClick={handleInventorySubmit}
                      disabled={!inventoryCategory || isFinalizingInventory}
                      className="flex items-center gap-2 bg-emerald-900 text-white px-8 py-3 rounded-2xl font-bold shadow-xl shadow-emerald-900/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100"
                    >
                      {isFinalizingInventory ? <RefreshCw className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
                      Finalizar Inventário
                    </button>
                  </div>
                </div>

                {inventoryCategory && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Produto</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">SKU</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Estoque Atual</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Quantidade Real</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Diferença</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {products.filter(p => p.category === inventoryCategory).map((p) => {
                            const actualQty = inventoryCounts[p.id] ?? p.quantity;
                            const diff = actualQty - p.quantity;
                            return (
                              <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4">
                                  <p className="text-sm font-bold text-slate-800">{p.name}</p>
                                  <p className="text-xs text-slate-400">{p.model || 'N/A'}</p>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="font-mono text-xs text-emerald-900 bg-emerald-50 px-2 py-1 rounded">{p.code}</span>
                                </td>
                                <td className="px-6 py-4 text-sm font-bold text-slate-600">
                                  {p.quantity} {p.unit}
                                </td>
                                <td className="px-6 py-4">
                                  <input 
                                    type="number"
                                    value={inventoryCounts[p.id] ?? p.quantity}
                                    onChange={(e) => setInventoryCounts(prev => ({ ...prev, [p.id]: parseInt(e.target.value) || 0 }))}
                                    className="w-24 px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-900/20 outline-none transition-all text-sm font-bold"
                                  />
                                </td>
                                <td className="px-6 py-4">
                                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                                    diff === 0 ? 'bg-slate-100 text-slate-500' :
                                    diff > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                                  }`}>
                                    {diff > 0 ? `+${diff}` : diff}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'tasks' && (
              <motion.div 
                key="tasks"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-2xl mx-auto space-y-6"
              >
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-100">
                    <h3 className="text-lg font-bold text-slate-800">Tarefas Diárias</h3>
                    <p className="text-sm text-slate-500">Organize sua rotina no almoxarifado</p>
                  </div>
                  <div className="p-6 space-y-6">
                    <form onSubmit={handleAddTask} className="flex gap-2">
                      <input 
                        value={newTaskText}
                        onChange={(e) => setNewTaskText(e.target.value)}
                        placeholder="Nova tarefa..."
                        className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-900/20 outline-none transition-all"
                      />
                      <button 
                        type="submit"
                        className="px-6 py-3 bg-emerald-900 text-white rounded-xl font-bold hover:bg-emerald-800 transition-colors"
                      >
                        Adicionar
                      </button>
                    </form>

                    <div className="space-y-2">
                      {tasks.map(task => (
                        <div 
                          key={task.id}
                          className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                            task.completed 
                              ? 'bg-slate-50 border-slate-100 opacity-60' 
                              : 'bg-white border-slate-200 hover:border-emerald-200'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={() => handleToggleTask(task.id)}
                              className={`transition-colors ${task.completed ? 'text-emerald-600' : 'text-slate-300 hover:text-emerald-900'}`}
                            >
                              {task.completed ? <CheckSquare size={24} /> : <Square size={24} />}
                            </button>
                            <span className={`text-sm font-medium ${task.completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                              {task.text}
                            </span>
                          </div>
                          <button 
                            onClick={() => handleDeleteTask(task.id)}
                            className="p-2 text-slate-300 hover:text-red-600 transition-colors"
                          >
                            <Trash size={18} />
                          </button>
                        </div>
                      ))}
                      {tasks.length === 0 && (
                        <div className="py-12 text-center text-slate-400">
                          <p>Nenhuma tarefa pendente.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
            {activeTab === 'purchase' && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">Lista de Compras</h3>
                      <p className="text-sm text-slate-500">Produtos marcados para reposição de estoque</p>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 rounded-xl text-sm font-bold">
                      <ShoppingCart size={18} />
                      {products.filter(p => p.purchase_requested === 1).length} Itens
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Produto</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Código</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estoque Atual</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {products.filter(p => p.purchase_requested === 1).map((p) => {
                          const status = STOCK_RULES(p.quantity, p.min_stock, p.max_stock);
                          return (
                            <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-slate-100 rounded-lg shrink-0 overflow-hidden flex items-center justify-center text-slate-300">
                                    {p.photo ? (
                                      <img src={p.photo} alt={p.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                    ) : (
                                      <Package size={20} />
                                    )}
                                  </div>
                                  <div>
                                    <p className="text-sm font-bold text-slate-800">{p.name}</p>
                                    <p className="text-[10px] text-slate-400">{p.category}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className="font-mono text-xs text-emerald-900 bg-emerald-50 px-1.5 py-0.5 rounded">{p.code}</span>
                              </td>
                              <td className="px-6 py-4">
                                <p className="text-sm font-bold text-slate-900">{p.quantity} {p.unit}</p>
                              </td>
                              <td className="px-6 py-4">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${status.color}`}>{status.label}</span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center justify-end gap-2">
                                  <button 
                                    onClick={() => handleTogglePurchase(p.id)}
                                    className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors"
                                  >
                                    Remover
                                  </button>
                                  <button 
                                    onClick={() => { setMovementType('IN'); setWithdrawalConfirmed(false); setShowMovementModal(p); }}
                                    className="px-4 py-2 bg-emerald-900 text-white rounded-lg text-xs font-bold hover:bg-emerald-800 transition-colors"
                                  >
                                    Registrar Entrada
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {products.filter(p => p.purchase_requested === 1).length === 0 && (
                          <tr>
                            <td colSpan={5} className="py-20 text-center">
                              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-300 mb-4">
                                <ShoppingCart size={32} />
                              </div>
                              <p className="text-slate-400 font-medium">Sua lista de compras está vazia</p>
                              <button 
                                onClick={() => setActiveTab('products')}
                                className="mt-4 text-emerald-900 font-bold text-sm hover:underline"
                              >
                                Ir para Produtos
                              </button>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'history' && (
              <motion.div 
                key="history"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="flex justify-end">
                  <button 
                    onClick={exportHistoryToCSV}
                    className="flex items-center gap-2 bg-white text-slate-700 border border-slate-200 px-6 py-2.5 rounded-xl font-bold shadow-sm hover:bg-slate-50 transition-all"
                  >
                    <Download size={20} />
                    Exportar Histórico
                  </button>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Data</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Produto</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Tipo</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Qtd</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Responsável</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {activities.map((a) => (
                        <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 text-sm text-slate-500 whitespace-nowrap">
                            {new Date(a.date).toLocaleString('pt-BR')}
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm font-bold text-slate-800">{a.title}</p>
                            <p className="text-xs text-slate-400 font-mono">{a.subtitle}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                              a.color === 'emerald' ? 'bg-emerald-50 text-emerald-600' : 
                              a.color === 'red' ? 'bg-red-50 text-red-600' : 
                              'bg-blue-50 text-blue-600'
                            }`}>
                              {a.action}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-slate-700">
                            {a.quantity !== null ? a.quantity : '—'}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {a.responsible}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      </main>

      {/* Add Product Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <PackagePlus className="text-emerald-900" />
                  Cadastrar Novo Produto
                </h3>
                <button onClick={() => { 
                  setShowAddModal(false); 
                  setFormError(null); 
                  setProductName('');
                  setProductModel('');
                  setIgnoreDuplicate(false);
                  setPhoto(null);
                }} className="p-2 hover:bg-white rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleAddProduct} className="p-8 space-y-6 overflow-y-auto max-h-[70vh] custom-scrollbar">
                {formError && (
                  <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 animate-shake">
                    <AlertTriangle size={18} />
                    {formError}
                  </div>
                )}
                <div className="flex flex-col md:flex-row gap-8">
                  {/* Photo Upload */}
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-32 h-32 bg-slate-100 rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-400 overflow-hidden relative group">
                      {photo ? (
                        <img src={photo} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <Camera size={24} />
                          <span className="text-[8px] font-bold uppercase">Sem Foto</span>
                        </div>
                      )}
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handlePhotoUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        title="Selecionar foto do computador"
                        id="add-product-photo"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-bold text-center p-2">
                        Clique para selecionar do computador
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 w-full">
                      <button 
                        type="button"
                        onClick={() => document.getElementById('add-product-photo')?.click()}
                        className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm flex items-center justify-center gap-1.5"
                      >
                        <Upload size={12} />
                        Selecionar Arquivo
                      </button>
                      {photo && (
                        <button 
                          type="button"
                          onClick={() => setPhoto(null)}
                          className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-[10px] font-bold hover:bg-red-100 transition-all flex items-center justify-center gap-1.5"
                        >
                          <X size={12} />
                          Remover
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nome do Produto</label>
                        {nameModelExists && (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 flex items-center gap-1">
                            <AlertTriangle size={10} /> Já Existe
                          </span>
                        )}
                      </div>
                      <input 
                        name="name" 
                        required 
                        value={productName}
                        onChange={(e) => setProductName(e.target.value)}
                        className={`w-full px-4 py-3 bg-slate-50 border ${nameModelExists ? 'border-amber-300' : 'border-slate-200'} rounded-xl focus:ring-2 focus:ring-emerald-900/20 outline-none transition-all`} 
                        placeholder="Ex: Rolamento de Esferas" 
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Código / SKU (6 Dígitos)</label>
                        {skuCode.length > 0 && (
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${skuExists ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                            {skuExists ? 'Duplicado' : 'Disponível'}
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <input 
                          name="code" 
                          required 
                          value={skuCode}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                            setSkuCode(val);
                          }}
                          className={`w-full px-4 py-3 bg-slate-50 border ${skuExists ? 'border-red-300' : 'border-slate-200'} rounded-xl focus:ring-2 focus:ring-emerald-900/20 outline-none transition-all font-mono`} 
                          placeholder="Ex: 000001" 
                        />
                        <button 
                          type="button"
                          onClick={fetchNextSku}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-emerald-900 transition-colors"
                          title="Gerar próximo código"
                        >
                          <RefreshCw size={14} />
                        </button>
                      </div>
                      {skuHistory.length > 0 && (
                        <div className="mt-2">
                          <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Últimos SKUs:</p>
                          <div className="flex gap-1.5 flex-wrap">
                            {skuHistory.map(code => (
                              <button 
                                key={code}
                                type="button"
                                onClick={() => setSkuCode(code)}
                                className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded hover:bg-slate-200 transition-colors"
                              >
                                {code}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Modelo</label>
                      <input 
                        name="model" 
                        value={productModel}
                        onChange={(e) => setProductModel(e.target.value)}
                        className={`w-full px-4 py-3 bg-slate-50 border ${nameModelExists ? 'border-amber-300' : 'border-slate-200'} rounded-xl focus:ring-2 focus:ring-emerald-900/20 outline-none transition-all`} 
                        placeholder="Ex: 6205-2RS" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Medidas</label>
                      <input name="dimensions" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-900/20 outline-none transition-all" placeholder="Ex: 25x52x15 mm" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Categoria</label>
                      <select name="category" required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-900/20 outline-none transition-all appearance-none">
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    {nameModelExists && (
                      <div className="md:col-span-2 flex items-center gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                        <input 
                          type="checkbox" 
                          id="ignoreDuplicate" 
                          checked={ignoreDuplicate}
                          onChange={(e) => setIgnoreDuplicate(e.target.checked)}
                          className="w-4 h-4 text-emerald-900 focus:ring-emerald-900 border-slate-300 rounded"
                        />
                        <label htmlFor="ignoreDuplicate" className="text-xs font-bold text-amber-800 cursor-pointer">
                          Ignorar aviso de duplicidade (Nome e Modelo já cadastrados)
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Localização</label>
                    <select name="location" required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-900/20 outline-none transition-all appearance-none">
                      {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Qtd Inicial</label>
                    <input name="quantity" type="number" defaultValue="0" min="0" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-900/20 outline-none transition-all" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Unidade</label>
                    <select name="unit" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-900/20 outline-none transition-all appearance-none">
                      <option value="UN">UN</option>
                      <option value="PC">PC</option>
                      <option value="KG">KG</option>
                      <option value="MT">MT</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Estoque Mínimo</label>
                    <input name="min_stock" type="number" defaultValue="3" min="0" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-900/20 outline-none transition-all" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Estoque Máximo</label>
                    <input name="max_stock" type="number" defaultValue="10" min="0" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-900/20 outline-none transition-all" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Descrição</label>
                  <textarea name="description" rows={3} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-900/20 outline-none transition-all resize-none" placeholder="Detalhes adicionais do produto..."></textarea>
                </div>
                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 py-3.5 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-all">Cancelar</button>
                  <button type="submit" className="flex-1 py-3.5 bg-emerald-900 text-white rounded-xl font-bold shadow-lg shadow-emerald-900/20 hover:scale-[1.02] active:scale-[0.98] transition-all">Salvar Produto</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Product Modal */}
      <AnimatePresence>
        {showEditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEditModal(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Edit3 className="text-emerald-900" />
                  Editar Produto: {showEditModal.code}
                </h3>
                <button onClick={() => setShowEditModal(null)} className="p-2 hover:bg-white rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleEditProduct} className="p-8 space-y-6 overflow-y-auto max-h-[70vh] custom-scrollbar">
                {formError && (
                  <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 animate-shake">
                    <AlertTriangle size={18} />
                    {formError}
                  </div>
                )}
                <div className="flex flex-col md:flex-row gap-8">
                  {/* Photo Upload */}
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-32 h-32 bg-slate-100 rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-400 overflow-hidden relative group">
                      {photo ? (
                        <img src={photo} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <Camera size={24} />
                          <span className="text-[8px] font-bold uppercase">Sem Foto</span>
                        </div>
                      )}
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handlePhotoUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        title="Selecionar foto do computador"
                        id="edit-product-photo"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-bold text-center p-2">
                        Clique para selecionar do computador
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 w-full">
                      <button 
                        type="button"
                        onClick={() => document.getElementById('edit-product-photo')?.click()}
                        className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm flex items-center justify-center gap-1.5"
                      >
                        <Upload size={12} />
                        Selecionar Arquivo
                      </button>
                      {photo && (
                        <button 
                          type="button"
                          onClick={() => setPhoto(null)}
                          className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-[10px] font-bold hover:bg-red-100 transition-all flex items-center justify-center gap-1.5"
                        >
                          <X size={12} />
                          Remover
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nome do Produto</label>
                        {nameModelExists && (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 flex items-center gap-1">
                            <AlertTriangle size={10} /> Já Existe
                          </span>
                        )}
                      </div>
                      <input 
                        name="name" 
                        required 
                        value={productName}
                        onChange={(e) => setProductName(e.target.value)}
                        className={`w-full px-4 py-3 bg-slate-50 border ${nameModelExists ? 'border-amber-300' : 'border-slate-200'} rounded-xl focus:ring-2 focus:ring-emerald-900/20 outline-none transition-all`} 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Código / SKU</label>
                      <input disabled value={showEditModal.code} className="w-full px-4 py-3 bg-slate-200 border border-slate-300 rounded-xl outline-none font-mono text-slate-500 cursor-not-allowed" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Modelo</label>
                      <input 
                        name="model" 
                        value={productModel}
                        onChange={(e) => setProductModel(e.target.value)}
                        className={`w-full px-4 py-3 bg-slate-50 border ${nameModelExists ? 'border-amber-300' : 'border-slate-200'} rounded-xl focus:ring-2 focus:ring-emerald-900/20 outline-none transition-all`} 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Medidas</label>
                      <input name="dimensions" defaultValue={showEditModal.dimensions} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-900/20 outline-none transition-all" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Categoria</label>
                      <select name="category" required defaultValue={showEditModal.category} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-900/20 outline-none transition-all appearance-none">
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    {nameModelExists && (
                      <div className="md:col-span-2 flex items-center gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                        <input 
                          type="checkbox" 
                          id="ignoreDuplicateEdit" 
                          checked={ignoreDuplicate}
                          onChange={(e) => setIgnoreDuplicate(e.target.checked)}
                          className="w-4 h-4 text-emerald-900 focus:ring-emerald-900 border-slate-300 rounded"
                        />
                        <label htmlFor="ignoreDuplicateEdit" className="text-xs font-bold text-amber-800 cursor-pointer">
                          Ignorar aviso de duplicidade (Nome e Modelo já cadastrados)
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Localização</label>
                    <select name="location" required defaultValue={showEditModal.location} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-900/20 outline-none transition-all appearance-none">
                      {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Unidade</label>
                    <select name="unit" defaultValue={showEditModal.unit} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-900/20 outline-none transition-all appearance-none">
                      <option value="UN">UN</option>
                      <option value="PC">PC</option>
                      <option value="KG">KG</option>
                      <option value="MT">MT</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Estoque Mínimo</label>
                    <input name="min_stock" type="number" defaultValue={showEditModal.min_stock} min="0" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-900/20 outline-none transition-all" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Estoque Máximo</label>
                    <input name="max_stock" type="number" defaultValue={showEditModal.max_stock} min="0" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-900/20 outline-none transition-all" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Descrição</label>
                  <textarea name="description" rows={3} defaultValue={showEditModal.description} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-900/20 outline-none transition-all resize-none" placeholder="Detalhes adicionais do produto..."></textarea>
                </div>
                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setShowEditModal(null)} className="flex-1 py-3.5 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-all">Cancelar</button>
                  <button type="submit" className="flex-1 py-3.5 bg-emerald-900 text-white rounded-xl font-bold shadow-lg shadow-emerald-900/20 hover:scale-[1.02] active:scale-[0.98] transition-all">Atualizar Produto</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Movement Modal */}
      <AnimatePresence>
        {showMovementModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMovementModal(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className={`p-6 border-b border-slate-100 flex items-center justify-between ${movementType === 'IN' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  {movementType === 'IN' ? <PackagePlus className="text-emerald-700" /> : <PackageMinus className="text-red-700" />}
                  Registrar {movementType === 'IN' ? 'Entrada' : 'Saída'}
                </h3>
                <button onClick={() => setShowMovementModal(null)} className="p-2 hover:bg-white rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 bg-slate-50 border-b border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Produto Selecionado</p>
                <h4 className="font-bold text-slate-800">{showMovementModal.name}</h4>
                <p className="text-xs text-slate-500">{showMovementModal.code} • Estoque Atual: {showMovementModal.quantity} {showMovementModal.unit}</p>
              </div>
              <form onSubmit={handleMovement} className="p-8 space-y-6 overflow-y-auto max-h-[70vh] custom-scrollbar">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Quantidade</label>
                  <input name="quantity" type="number" required min="1" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-900/20 outline-none transition-all" placeholder="0" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Data da Movimentação</label>
                  <input 
                    name="date" 
                    type="datetime-local" 
                    defaultValue={new Date().toISOString().slice(0, 16)}
                    required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-900/20 outline-none transition-all" 
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Responsável</label>
                  <input 
                    name="responsible" 
                    id="responsible-input"
                    required 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-900/20 outline-none transition-all" 
                    placeholder="Nome de quem está retirando/entregando" 
                  />
                  
                  {/* Quick Select Responsibles */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {Array.from(new Set<string>(dashboard?.recentMovements.map(m => m.responsible) || [])).slice(0, 5).map(name => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => {
                          const input = document.getElementById('responsible-input') as HTMLInputElement;
                          if (input) input.value = name;
                        }}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 rounded-full text-[10px] font-bold transition-all border border-transparent hover:border-emerald-100"
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>

                {movementType === 'OUT' && (
                  <div className="bg-red-50 p-4 rounded-xl border border-red-100 flex items-start gap-3">
                    <input 
                      type="checkbox" 
                      id="confirm-withdrawal" 
                      checked={withdrawalConfirmed}
                      onChange={(e) => setWithdrawalConfirmed(e.target.checked)}
                      className="mt-1 w-4 h-4 text-red-600 border-red-300 rounded focus:ring-red-500"
                    />
                    <label htmlFor="confirm-withdrawal" className="text-sm text-red-700 font-medium cursor-pointer select-none">
                      Confirmo que a quantidade acima foi retirada fisicamente do estoque e está sob minha responsabilidade.
                    </label>
                  </div>
                )}

                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setShowMovementModal(null)} className="flex-1 py-3.5 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-all">Cancelar</button>
                  <button 
                    type="submit" 
                    disabled={movementType === 'OUT' && !withdrawalConfirmed}
                    className={`flex-1 py-3.5 text-white rounded-xl font-bold shadow-lg transition-all ${
                      movementType === 'IN' ? 'bg-emerald-900 shadow-emerald-900/20' : 
                      withdrawalConfirmed ? 'bg-red-600 shadow-red-600/20' : 'bg-slate-300 shadow-none cursor-not-allowed'
                    } ${withdrawalConfirmed || movementType === 'IN' ? 'hover:scale-[1.02] active:scale-[0.98]' : ''}`}
                  >
                    Confirmar {movementType === 'IN' ? 'Entrada' : 'Saída'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDeleteConfirm(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden p-8 text-center space-y-6"
            >
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto">
                <AlertTriangle size={32} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-slate-800">Excluir Produto?</h3>
                <p className="text-sm text-slate-500">
                  Você está prestes a excluir <span className="font-bold text-slate-700">{showDeleteConfirm.name}</span>. 
                  Esta ação também removerá todo o histórico de movimentações deste item e não pode ser desfeita.
                </p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowDeleteConfirm(null)}
                  className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => handleDeleteProduct(showDeleteConfirm.id)}
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold shadow-lg shadow-red-600/20 hover:bg-red-700 transition-all"
                >
                  Confirmar Exclusão
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.2s ease-in-out 0s 2;
        }
      `}</style>
    </div>
  );
}

