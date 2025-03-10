use serde::{Deserialize, Serialize};

use crate::types::User;

pub enum Action {
    Read,
    Create,
    Update,
    Delete,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "kind")]
pub enum Role {
    Any,
    User { id: String },
    Group { id: String },
}

#[derive(Serialize, Deserialize)]
pub struct Permissions {
    pub read: Vec<Role>,
    pub create: Vec<Role>,
    pub update: Vec<Role>,
    pub delete: Vec<Role>,
}

impl Permissions {
    pub fn empty() -> Self {
        Permissions {
            read: Vec::new(),
            create: Vec::new(),
            update: Vec::new(),
            delete: Vec::new(),
        }
    }

    pub fn parse_or_empty(input: &str) -> Self {
        serde_json::from_str(input).unwrap_or_else(|_| Permissions::empty())
    }

    pub fn check(&self, user: &User, action: Action) -> bool {
        let list = match action {
            Action::Read => &self.read,
            Action::Create => &self.create,
            Action::Update => &self.update,
            Action::Delete => &self.delete,
        };
        for item in list {
            match item {
                Role::Any => {
                    return true;
                }
                Role::User { id } => {
                    if user.id == *id {
                        return true;
                    }
                }
                Role::Group { id } => {
                    if user.groups.contains(id) {
                        return true;
                    }
                }
            }
        }
        false
    }
}

impl std::fmt::Display for Permissions {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "{}", serde_json::to_string(self).unwrap())
    }
}
