"use client";

import { Edit, FolderPlus, Trash2, UserCog, UserMinus, Eye, EyeOff, UserPlus, Share2, ArrowLeftRight, List, LayoutGrid, Calendar, Clock, SlidersHorizontal, Link, ArrowUpRight, Lock, ListFilter, ArrowUpDown, Zap, Ellipsis, Database, Copy, Layers, WrapText, ChevronLeft, ChevronRight, FileText, Paintbrush, Plus, BarChart3, GripVertical, Hash, AlignLeft, Grid2x2, Spline, AreaChart, AlignStartHorizontal, Images } from 'lucide-react';

/**
 * Common icons for dropdown menu items
 * All icons are standardized to h-4 w-4 with text-muted-foreground
 */

export const DropdownMenuIcons = {
  /**
   * Rename/Edit icon
   */
  Rename: () => <Edit className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Create work area from group icon
   */
  CreateWorkArea: () => <FolderPlus className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Delete/Remove icon
   */
  Delete: () => <Trash2 className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Make admin / User settings icon
   */
  MakeAdmin: () => <UserCog className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Make member / Remove admin icon
   */
  MakeMember: () => <UserMinus className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * View work area / Eye icon
   */
  View: () => <Eye className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Add members icon
   */
  AddMembers: () => <UserPlus className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Generic add/plus icon
   */
  Plus: () => <Plus className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Share icon
   */
  Share: () => <Share2 className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Move/Transfer icon (for moving between private/public)
   */
  Move: () => <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * List view icon
   */
  List: () => <List className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Board/Grid view icon
   */
  Board: () => <LayoutGrid className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Calendar view icon
   */
  Calendar: () => <Calendar className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Timeline view icon
   */
  Timeline: () => <Clock className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Edit/Settings icon (SlidersHorizontal)
   */
  EditView: () => <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Paintbrush icon (form styling)
   */
  Paintbrush: () => <Paintbrush className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Link icon
   */
  Link: () => <Link className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * External link / Open full page icon
   */
  ExternalLink: () => <ArrowUpRight className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Eye / View icon
   */
  Eye: () => <Eye className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Lock icon
   */
  Lock: () => <Lock className="h-3 w-3 text-muted-foreground" />,
  
  /**
   * Type/Swap icon (custom SVG for view type)
   */
  Type: () => (
    <svg
      aria-hidden="true"
      role="graphics-symbol"
      viewBox="0 0 20 20"
      className="w-4 h-4 text-muted-foreground"
      fill="currentColor"
    >
      <path d="M6.475 3.125a.625.625 0 1 0 0 1.25h7.975c.65 0 1.175.526 1.175 1.175v6.057l-1.408-1.408a.625.625 0 1 0-.884.884l2.475 2.475a.625.625 0 0 0 .884 0l2.475-2.475a.625.625 0 0 0-.884-.884l-1.408 1.408V5.55a2.425 2.425 0 0 0-2.425-2.425zM3.308 6.442a.625.625 0 0 1 .884 0l2.475 2.475a.625.625 0 1 1-.884.884L4.375 8.393v6.057c0 .649.526 1.175 1.175 1.175h7.975a.625.625 0 0 1 0 1.25H5.55a2.425 2.425 0 0 1-2.425-2.425V8.393L1.717 9.801a.625.625 0 1 1-.884-.884z" />
    </svg>
  ),
  
  /**
   * Filter icon
   */
  Filter: () => <ListFilter className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Sort icon
   */
  Sort: () => <ArrowUpDown className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Zap/Lightning icon (for conditional color, automations)
   */
  Zap: () => <Zap className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Ellipsis icon (for more settings)
   */
  Ellipsis: () => <Ellipsis className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Database icon
   */
  Database: () => <Database className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Edit Properties icon
   */
  EditProperties: () => <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Copy/Duplicate icon
   */
  Copy: () => <Copy className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Database/Data source icon (default SVG)
   */
  DatabaseDefault: () => (
    <svg viewBox="0 0 20 20" className="w-5 h-5 block flex-shrink-0 fill-gray-500 dark:fill-gray-400">
      <path d="M10 2.375c-1.778 0-3.415.256-4.63.69-.604.216-1.138.488-1.532.82-.391.331-.713.784-.713 1.347q0 .157.032.304h-.032v9.232c0 .563.322 1.016.713 1.346.394.333.928.605 1.532.82 1.215.435 2.852.691 4.63.691s3.415-.256 4.63-.69c.604-.216 1.138-.488 1.532-.82.391-.331.713-.784.713-1.347V5.536h-.032q.031-.147.032-.304c0-.563-.322-1.016-.713-1.346-.394-.333-.928-.605-1.532-.82-1.215-.435-2.852-.691-4.63-.691M4.375 5.232c0-.053.028-.188.27-.391.238-.201.62-.41 1.146-.599 1.047-.374 2.535-.617 4.209-.617s3.162.243 4.21.617c.526.188.907.398 1.146.599.24.203.269.338.269.391s-.028.188-.27.391c-.238.202-.62.41-1.146.599-1.047.374-2.535.617-4.209.617s-3.162-.243-4.21-.617c-.526-.188-.907-.397-1.146-.599-.24-.203-.269-.338-.269-.39m11.25 1.718V10c0 .053-.028.188-.27.391-.238.201-.62.41-1.146.599-1.047.374-2.535.617-4.209.617s-3.162-.243-4.21-.617c-.526-.188-.907-.398-1.146-.599-.24-.203-.269-.338-.269-.391V6.95c.297.17.633.32.995.45 1.215.433 2.852.69 4.63.69s3.415-.257 4.63-.69c.362-.13.698-.28.995-.45m-11.25 7.818v-3.05c.297.17.633.32.995.449 1.215.434 2.852.69 4.63.69s3.415-.256 4.63-.69c.362-.13.698-.279.995-.45v3.05c0 .054-.028.189-.27.392-.238.201-.62.41-1.146.599-1.047.374-2.535.617-4.209.617s-3.162-.243-4.21-.617c-.526-.188-.907-.398-1.146-.599-.24-.203-.269-.338-.269-.391"></path>
    </svg>
  ),
  
  /**
   * Hide/EyeOff icon
   */
  Hide: () => <EyeOff className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Group/Layers icon
   */
  Group: () => <Layers className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Wrap text icon
   */
  WrapText: () => <WrapText className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Insert left / Chevron left icon
   */
  InsertLeft: () => <ChevronLeft className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Insert right / Chevron right icon
   */
  InsertRight: () => <ChevronRight className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Form view icon
   */
  Form: () => <FileText className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Chart view icon
   */
  Chart: () => <BarChart3 className="h-4 w-4 text-muted-foreground" />,

  /**
   * Gallery view icon
   */
  Gallery: () => <Images className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Grid lines / Grip vertical icon
   */
  GridLines: () => <GripVertical className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Hash / Number icon (for color by value)
   */
  Hash: () => <Hash className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Align left / Text align icon (for data labels and caption)
   */
  AlignLeft: () => <AlignLeft className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Grid 2x2 icon (for grid lines)
   */
  Grid2x2: () => <Grid2x2 className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Chart spline icon (for smooth line)
   */
  ChartSpline: () => <Spline className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Chart area icon (for gradient area)
   */
  ChartArea: () => <AreaChart className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Text align start icon (for caption)
   */
  TextAlignStart: () => <AlignStartHorizontal className="h-4 w-4 text-muted-foreground" />,
  
  /**
   * Count icon (for numbers like 123) - used for Data labels
   */
  Count: () => (
    <svg
      aria-hidden="true"
      role="graphics-symbol"
      viewBox="0 0 20 20"
      className="w-4 h-4 text-muted-foreground"
      fill="currentColor"
    >
      <path d="M8.793 6.767c-.816 0-1.472.465-1.71 1.036a.625.625 0 1 1-1.154-.482C6.38 6.242 7.52 5.517 8.794 5.517c1.618 0 3.068 1.181 3.068 2.786a2.62 2.62 0 0 1-.762 1.835l-3.312 3.095h3.637a.625.625 0 1 1 0 1.25h-5.22a.625.625 0 0 1-.427-1.081l4.453-4.163a1.37 1.37 0 0 0 .381-.936c0-.775-.742-1.536-1.818-1.536m7.576 0c-.868 0-1.508.425-1.724.877a.625.625 0 0 1-1.127-.54c.473-.99 1.629-1.587 2.85-1.587.799 0 1.546.247 2.107.675.56.429.962 1.066.962 1.819s-.401 1.39-.962 1.819l-.036.026q.085.056.165.116c.595.448 1.02 1.114 1.02 1.902s-.425 1.454-1.02 1.903c-.595.448-1.388.706-2.236.706-1.287 0-2.488-.6-3.008-1.6a.625.625 0 1 1 1.108-.577c.252.484.952.927 1.9.927.602 0 1.125-.185 1.484-.455.358-.27.522-.595.522-.904 0-.308-.164-.634-.522-.904-.359-.27-.882-.455-1.484-.455h-.554a.625.625 0 0 1 0-1.25h.44a1 1 0 0 1 .114-.01c.549 0 1.023-.17 1.348-.419.323-.247.47-.544.47-.825s-.147-.579-.47-.826c-.325-.247-.8-.418-1.348-.418M3.731 6.22l.005.078v7.56a.625.625 0 0 1-1.25 0V7.21l-1.182.658a.625.625 0 0 1-.608-1.092L2.806 5.6a.625.625 0 0 1 .925.62" />
    </svg>
  ),
  
  /**
   * Alphabet icon (for XY) - used for Axis name
   */
  Alphabet: () => (
    <svg
      aria-hidden="true"
      role="graphics-symbol"
      viewBox="0 0 20 20"
      className="w-4 h-4 text-muted-foreground"
      fill="currentColor"
    >
      <path d="M11.72 4.403a.625.625 0 1 0-1.04.694l2.804 4.205v3.223a.625.625 0 0 0 1.25 0V9.21l2.742-4.113a.625.625 0 0 0-1.04-.694L14.078 7.94zm-7.543.037a.625.625 0 1 0-1.016.729l2.504 3.496-2.504 3.496a.625.625 0 1 0 1.016.728l2.257-3.151 2.257 3.15a.625.625 0 1 0 1.016-.727L7.203 8.665l2.504-3.496a.625.625 0 1 0-1.016-.728L6.434 7.59zM2.25 14.625a.625.625 0 1 0 0 1.25h.005a.625.625 0 0 0 0-1.25zm1.933 0a.625.625 0 1 0 0 1.25h.01a.625.625 0 0 0 0-1.25zm1.937 0a.625.625 0 1 0 0 1.25h.01a.625.625 0 0 0 0-1.25zm1.938 0a.625.625 0 1 0 0 1.25h.01a.625.625 0 0 0 0-1.25zm1.937 0a.625.625 0 1 0 0 1.25h.01a.625.625 0 0 0 0-1.25zm1.938 0a.625.625 0 1 0 0 1.25h.01a.625.625 0 0 0 0-1.25zm1.937 0a.625.625 0 1 0 0 1.25h.01a.625.625 0 0 0 0-1.25zm1.938 0a.625.625 0 1 0 0 1.25h.01a.625.625 0 0 0 0-1.25zm1.937 0a.625.625 0 1 0 0 1.25h.005a.625.625 0 0 0 0-1.25z" />
    </svg>
  ),

  Sprint: () => (
    <svg
      aria-hidden="true"
      role="graphics-symbol"
      viewBox="0 0 20 20"
      className="w-4 h-4 text-muted-foreground"
      fill="currentColor"
    >
      <path d="M13.105 4.184a1.475 1.475 0 1 1-2.934-.309 1.475 1.475 0 0 1 2.934.309m-5.297 7.25-.753 2.994-2.334 2.101a.55.55 0 0 0 .737.817l2.582-2.325.72-2.864-.662-.476a2.3 2.3 0 0 1-.29-.247" />
      <path d="M11.681 8.169q.127.206.208.442l.567 1.67a.55.55 0 0 0 .66.354l2.032-.527a.55.55 0 1 0-.276-1.065l-1.539.4-.403-1.186a3.296 3.296 0 0 0-3.278-2.232l-3.02.145a.55.55 0 0 0-.513.438l-.501 2.42a.55.55 0 0 0 1.077.223l.415-2.002 1.654-.08-.03.294-.603 2.18a1.45 1.45 0 0 0 .516 1.537l3.05 2.335-2.08 1.51a.55.55 0 1 0 .647.89l2.579-1.873a.64.64 0 0 0 .013-1.026l-2.168-1.659z" />
    </svg>
  ),
} as const;

