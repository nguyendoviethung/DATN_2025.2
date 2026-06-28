import {
  DashboardOutlined,
  BookOutlined,
  UserOutlined,
  MessageOutlined,
  QrcodeOutlined,
  SaveOutlined,
} from "@ant-design/icons";

export const menuItemsAdmin = [
  {
    key: "dashboard",
    icon: <DashboardOutlined />,
    label: "Dashboard",
    path: "/admin/dashboard",
  },
  {
    key: "books",
    icon: <BookOutlined />,
    label: "Books",
    path: "/admin/books",
  },
  {
    key: "readers",
    icon: <UserOutlined />,
    label: "Readers",
    path: "/admin/readers",
  },
  {
    key: "borrow-books",
    icon: <QrcodeOutlined />,
    label: "Borrow Books",
    path: "/admin/borrow-books",
  },
  {
    key: "reservations",
    icon: <SaveOutlined />,
    label: "Reservations",
    path: "/admin/reservations",
  },
  // {
  //   key: "messages",
  //   icon: <MessageOutlined />,
  //   label: "Messages",
  //   path: "/admin/messages",
  // },
];