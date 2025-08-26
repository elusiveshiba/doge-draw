'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/providers/AuthProvider'
import { Button } from '@/components/ui/button'
import { formatCredits } from '@/lib/utils'
import { ModerationPanel } from '@/components/admin/ModerationPanel'

interface User {
  id: string
  walletAddress: string
  credits: number
  isAdmin: boolean
  createdAt: string
  _count: {
    pixelHistory: number
    changedPixels: number
    reports: number
    transactions: number
  }
  isTrusted: boolean
}

export default function AdminPage() {
  const { user, isLoading: authLoading, refreshUser } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setLoading] = useState(true)
  const [creditsLoading, setCreditsLoading] = useState<string | null>(null)
  const [trustLoading, setTrustLoading] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'users' | 'moderation' | 'boards'>('users')

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch('/api/admin/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch users')
      }

      const data = await response.json()
      setUsers(data.users)
    } catch (error) {
      console.error('Error fetching users:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddCredits = async (userId: string) => {
    setCreditsLoading(userId)
    
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch('/api/admin/add-credits', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId, amount: 1000 })
      })

      const result = await response.json()
      
      if (result.success) {
        // Update the user's credits in the local state
        setUsers(prev => prev.map(u => 
          u.id === userId 
            ? { ...u, credits: u.credits + 1000 }
            : u
        ))
        if (userId === user?.id) {
          await refreshUser()
        }
      } else {
        console.error('Failed to add credits:', result.error)
        alert('Failed to add credits: ' + result.error)
      }
    } catch {
      console.error('Error adding credits')
      alert('Error adding credits')
    } finally {
      setCreditsLoading(null)
    }
  }

  const handleTrustUser = async (userId: string) => {
    setTrustLoading(userId)
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch('/api/moderation/trusted-users', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId, reason: 'Manual admin trust from dashboard' })
      })
      const result = await response.json()
      if (result.success) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, isTrusted: true } : u))
        alert('User promoted to trusted status')
      } else {
        alert('Failed to trust user: ' + (result.error || 'Unknown error'))
      }
    } catch (error) {
      alert('Error trusting user')
    } finally {
      setTrustLoading(null)
    }
  }

  useEffect(() => {
    if (!user?.isAdmin || authLoading) return
    fetchUsers()
    const interval = setInterval(fetchUsers, 5000)
    return () => clearInterval(interval)
  }, [authLoading, user?.isAdmin])

  if (authLoading || isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">Loading...</div>
      </div>
    )
  }

  if (!user?.isAdmin) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600">You need admin permissions to access this page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-600 mt-2">Manage users, credits, and moderation</p>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('users')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'users'
                ? 'border-doge-orange text-doge-orange'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            User Management
          </button>
          <button
            onClick={() => setActiveTab('moderation')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'moderation'
                ? 'border-doge-orange text-doge-orange'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Moderation
          </button>
          <button
            onClick={() => setActiveTab('boards')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'boards'
                ? 'border-doge-orange text-doge-orange'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Board Management
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'users' && (
        <div className="bg-white shadow-sm border rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              All Users ({users.length})
            </h2>
          </div>

        {users.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No users found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Wallet Address
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Credits
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Activity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Joined
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((userData) => (
                  <tr key={userData.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm">
                        <div className="font-mono text-gray-900">
                          {userData.walletAddress.length > 20 
                            ? `${userData.walletAddress.slice(0, 8)}...${userData.walletAddress.slice(-6)}`
                            : userData.walletAddress}
                        </div>
                        <div className="text-xs text-gray-500 font-mono">
                          {userData.walletAddress}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {formatCredits(userData.credits)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="text-xs text-gray-500 space-y-1">
                        <div>{userData._count.pixelHistory} pixels painted</div>
                        <div>{userData._count.changedPixels} pixels owned</div>
                        <div>{userData._count.transactions} transactions</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {userData.isAdmin ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          Admin
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          User
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(userData.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddCredits(userData.id)}
                        disabled={creditsLoading === userData.id}
                        className="border-green-500 text-green-600 hover:bg-green-50"
                      >
                        {creditsLoading === userData.id ? 'Adding...' : '+1000 Credits'}
                      </Button>
                      <Button
                        variant="doge"
                        size="sm"
                        onClick={() => handleTrustUser(userData.id)}
                        disabled={trustLoading === userData.id || userData.isAdmin || userData.isTrusted}
                        className="ml-2 border-yellow-500 text-yellow-700 hover:bg-yellow-50"
                      >
                        {trustLoading === userData.id ? 'Trusting...' : (userData.isTrusted ? 'Trusted' : 'Trust')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>
      )}

      {activeTab === 'moderation' && (
        <ModerationPanel />
      )}

      {activeTab === 'boards' && (
        <BoardImportPanel />
      )}
    </div>
  )
}

interface ImportResult {
  success: boolean
  message?: string
  data?: {
    boardId: string
    pixelsImported: number
    historyImported: number
    usersProcessed: number
  }
  error?: string
  details?: unknown
}

interface ImportPreview {
  version: string
  exportedAt: string
  exportedBy: {
    id: string
    walletAddress: string
  }
  board: {
    name: string
    width: number
    height: number
    startingPixelPrice: number
    priceMultiplier: number
    isActive: boolean
    isFrozen: boolean
    endDate: string | null
    createdAt: string
    updatedAt: string
  }
  statistics: {
    totalPixels: number
    totalHistoryEntries: number
    uniqueContributors: number
  }
}

function BoardImportPanel() {
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [editableName, setEditableName] = useState('')
  const [editableStartingPrice, setEditableStartingPrice] = useState(100)
  const [editableMultiplier, setEditableMultiplier] = useState(1.2)
  const [editableEndDate, setEditableEndDate] = useState('')

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      setImportPreview(null)
      setEditableName('')
      return
    }

    if (!file.name.endsWith('.json')) {
      alert('Please select a JSON file')
      event.target.value = ''
      return
    }

    try {
      setImportResult(null)
      setImportPreview(null)
      
      const fileContent = await file.text()
      const importData = JSON.parse(fileContent)
      
      // Validate basic structure
      if (!importData.version || !importData.board || !importData.pixels || !importData.pixelHistory) {
        throw new Error('Invalid board export file format')
      }

      // Create preview data
      const preview: ImportPreview = {
        version: importData.version,
        exportedAt: importData.exportedAt,
        exportedBy: importData.exportedBy,
        board: importData.board,
        statistics: importData.statistics
      }

      setImportPreview(preview)
      setEditableName(preview.board.name)
      setEditableStartingPrice(preview.board.startingPixelPrice)
      setEditableMultiplier(preview.board.priceMultiplier)
      setEditableEndDate(preview.board.endDate ? new Date(preview.board.endDate).toISOString().slice(0, 16) : '')
      
    } catch (error) {
      console.error('Error reading board file:', error)
      alert('Error reading file: ' + (error instanceof Error ? error.message : 'Invalid file format'))
      event.target.value = ''
      setImportPreview(null)
      setEditableName('')
      setEditableStartingPrice(100)
      setEditableMultiplier(1.2)
      setEditableEndDate('')
    }
  }

  const handleImport = async () => {
    if (!importPreview) return

    try {
      setIsImporting(true)
      setImportResult(null)
      
      // Get the file content again and modify the name
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = fileInput.files?.[0]
      if (!file) throw new Error('File not found')
      
      const fileContent = await file.text()
      const importData = JSON.parse(fileContent)
      
      // Update the board settings if changed
      importData.board.name = editableName
      importData.board.startingPixelPrice = editableStartingPrice
      importData.board.priceMultiplier = editableMultiplier
      importData.board.endDate = editableEndDate ? new Date(editableEndDate).toISOString() : null
      
      const token = localStorage.getItem('auth_token')
      const response = await fetch('/api/admin/boards/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(importData)
      })

      const result = await response.json()
      setImportResult(result)
      
      if (result.success) {
        // Reset everything
        fileInput.value = ''
        setImportPreview(null)
        setEditableName('')
        setEditableStartingPrice(100)
        setEditableMultiplier(1.2)
        setEditableEndDate('')
      }
      
    } catch (error) {
      console.error('Error importing board:', error)
      setImportResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      })
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="bg-white shadow-sm border rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Board Import</h2>
        <p className="text-gray-600 text-sm mt-1">Import board data with full history from a JSON export file</p>
      </div>

      <div className="p-6">
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Board Export File
          </label>
          <input
            type="file"
            accept=".json"
            onChange={handleFileSelect}
            disabled={isImporting}
            className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none
              file:mr-4 file:py-2 file:px-4
              file:rounded-l-lg file:border-0
              file:text-sm file:font-semibold
              file:bg-doge-orange file:text-white
              file:hover:bg-orange-600
              file:cursor-pointer
              disabled:file:bg-gray-400 disabled:file:cursor-not-allowed
              disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          <p className="text-xs text-gray-500 mt-1">
            Only JSON files exported from this system are supported
          </p>
        </div>

        {importPreview && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
            <h3 className="text-sm font-medium text-green-800 mb-3">Board Preview</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Board Name (editable)</label>
                <input
                  type="text"
                  value={editableName}
                  onChange={(e) => setEditableName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Enter board name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dimensions</label>
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-900">
                  {importPreview.board.width} × {importPreview.board.height} pixels
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Starting Price (editable)</label>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={editableStartingPrice}
                  onChange={(e) => setEditableStartingPrice(parseInt(e.target.value) || 100)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Starting pixel price in credits"
                />
                <p className="text-xs text-gray-500 mt-1">Credits per pixel for new pixels</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price Multiplier (editable)</label>
                <input
                  type="number"
                  min="1.0"
                  max="5.0"
                  step="0.1"
                  value={editableMultiplier}
                  onChange={(e) => setEditableMultiplier(parseFloat(e.target.value) || 1.2)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Price increase multiplier"
                />
                <p className="text-xs text-gray-500 mt-1">Price increases by this factor when pixel is changed</p>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Expiration Date (editable)</label>
                <input
                  type="datetime-local"
                  value={editableEndDate}
                  onChange={(e) => setEditableEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Optional expiration date"
                />
                <p className="text-xs text-gray-500 mt-1">Leave empty for no expiration date</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Export Version</label>
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-900">
                  v{importPreview.version}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Exported Date</label>
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-900">
                  {new Date(importPreview.exportedAt).toLocaleDateString()}
                </div>
              </div>
            </div>
            
            <div className="mb-4">
              <h4 className="text-sm font-medium text-green-800 mb-2">Statistics</h4>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="text-center">
                  <div className="font-medium text-gray-900">{importPreview.statistics.totalPixels.toLocaleString()}</div>
                  <div className="text-gray-600">Total Pixels</div>
                </div>
                <div className="text-center">
                  <div className="font-medium text-gray-900">{importPreview.statistics.totalHistoryEntries.toLocaleString()}</div>
                  <div className="text-gray-600">History Entries</div>
                </div>
                <div className="text-center">
                  <div className="font-medium text-gray-900">{importPreview.statistics.uniqueContributors.toLocaleString()}</div>
                  <div className="text-gray-600">Contributors</div>
                </div>
              </div>
            </div>

            <div className="flex space-x-2">
              <Button
                onClick={handleImport}
                disabled={isImporting || !editableName.trim() || editableStartingPrice < 1 || editableStartingPrice > 10000 || editableMultiplier < 1.0 || editableMultiplier > 5.0}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {isImporting ? 'Importing...' : 'Import Board'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setImportPreview(null)
                  setEditableName('')
                  setEditableStartingPrice(100)
                  setEditableMultiplier(1.2)
                  setEditableEndDate('')
                  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
                  if (fileInput) fileInput.value = ''
                }}
                disabled={isImporting}
                className="border-gray-300"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {isImporting && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
              <span className="text-blue-700">Importing board data...</span>
            </div>
          </div>
        )}

        {importResult && (
          <div className={`border rounded-lg p-4 mb-4 ${
            importResult.success 
              ? 'bg-green-50 border-green-200' 
              : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-start">
              <div className={`flex-shrink-0 ${
                importResult.success ? 'text-green-600' : 'text-red-600'
              }`}>
                {importResult.success ? '✅' : '❌'}
              </div>
              <div className="ml-3 flex-1">
                <h3 className={`text-sm font-medium ${
                  importResult.success ? 'text-green-800' : 'text-red-800'
                }`}>
                  {importResult.success ? 'Import Successful' : 'Import Failed'}
                </h3>
                
                {importResult.success && importResult.data && (
                  <div className="mt-2 text-sm text-green-700">
                    <p>Board imported with ID: <code className="bg-white px-1 rounded">{importResult.data.boardId}</code></p>
                    <ul className="mt-1 list-disc list-inside space-y-1">
                      <li>{importResult.data.pixelsImported} pixels imported</li>
                      <li>{importResult.data.historyImported} history entries imported</li>
                      <li>{importResult.data.usersProcessed} users processed</li>
                    </ul>
                  </div>
                )}
                
                {!importResult.success && (
                  <div className="mt-2 text-sm text-red-700">
                    <p>{importResult.error || 'An unknown error occurred'}</p>
                    {importResult.details && (
                      <details className="mt-2">
                        <summary className="cursor-pointer">Show details</summary>
                        <pre className="mt-1 text-xs bg-white p-2 rounded overflow-auto">
                          {JSON.stringify(importResult.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <span className="text-yellow-600">⚠️</span>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">Important Notes</h3>
              <ul className="mt-1 text-sm text-yellow-700 list-disc list-inside space-y-1">
                <li>Importing will create a new board with a new ID</li>
                <li>Users referenced in the import will be created if they do not exist</li>
                <li>Imported users cannot log in until they register properly</li>
                <li>All timestamps and history will be preserved</li>
                <li>Existing pixel prices remain unchanged - only starting price and multiplier settings apply to new pixels</li>
                <li>This operation cannot be undone</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 